import { providers } from '../providers/manager.js';
import { systemPrompt } from '../providers/openaiCompatible.js';
import {
  ProviderUnavailable,
  type ChatMessage, type ProviderId,
} from '../providers/types.js';
import type { RequestHandle } from '../orchestrator/orchestrator.js';


/**
 * The user's stored memories, newest first, as plain lines.
 *
 * Capped deliberately: this goes into every prompt, so an unbounded list
 * would grow the token bill of every single turn. Likes, dislikes and
 * preferences are pulled ahead of general facts because they change how an
 * answer should be written, not just what it contains.
 */
/**
 * A project's standing brief: its custom instructions plus any knowledge
 * documents pinned to it.
 *
 * This is what makes a project more than a memory scope — the same idea as
 * Claude Projects, where a project carries instructions and reference
 * material that apply to every conversation inside it.
 */
async function projectBrief(projectId?: string): Promise<string> {
  if (!projectId) return '';
  try {
    const p = await db.raw.project.findUnique({
      where: { id: projectId },
      include: { knowledge: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!p) return '';

    const parts: string[] = [`You are working inside the project "${p.name}".`];
    if (p.description) parts.push(p.description);
    if (p.rootPath) parts.push(`Its files live in ${p.rootPath}; default there for file work.`);
    if (p.instructions) parts.push(`\nInstructions for this project:\n${p.instructions}`);

    for (const d of p.knowledge ?? []) {
      /* Capped: knowledge rides in every turn, so a long document would grow
         the token bill of the whole conversation. Anything bigger belongs on
         disk, where the filesystem tool can read the part that matters. */
      parts.push(`\nProject knowledge — ${d.title}:\n${String(d.content).slice(0, 4000)}`);
    }
    return parts.join('\n');
  } catch {
    return '';
  }
}

async function recallMemories(projectId?: string, limit = 40): Promise<string[]> {
  try {
    /* Global memories always apply; project memories only while that project
       is active. Without the scope, everything learned on one project would
       colour answers on every other one. */
    const rows = await db.raw.memory.findMany({
      where: projectId ? { OR: [{ projectId: null }, { projectId }] } : { projectId: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const weight = (k: string) =>
      k === 'like' || k === 'dislike' || k === 'preference' ? 0 : 1;
    return rows
      .sort((a: any, b: any) => weight(a.kind) - weight(b.kind))
      .slice(0, limit)
      .map((r: any) => `(${r.kind}) ${r.content}`);
  } catch {
    // No database is not a reason to fail the turn — just answer without it.
    return [];
  }
}
import { tools } from '../tools/registry.js';
import { connections } from '../mcp/manager.js';
import { supervise } from '../agents/supervisor.js';
import { tryLocalIntent } from '../intents/local.js';
import { db } from '../db/client.js';
import { setActiveProject } from '../tools/memory.js';
import { determineMode } from '../mode/connectivity.js';
import { runAgenticCrawl } from '../crawler/Frontier.js';
import { retrieveContext } from '../rag/Retriever.js';

/**
 * The Planner reasons about a request and drives it to an answer, running any
 * tools the model asks for along the way.
 *
 * It does not own cancellation, timing, or cleanup — the Orchestrator does.
 *
 * Every stage emitted corresponds to work actually performed. There is no
 * cosmetic stage: if no tool is requested, no tool event is emitted, and the
 * frontend shows nothing for it.
 */

export interface PlanInput {
  message: string;
  conversationId?: string;
  provider?: ProviderId;
  model?: string;
  /** Scopes memory recall to one project's workspace. */
  projectId?: string;
}

/* The tool-round and nudge budgets moved to agents/specialist.ts, where the
   loop they bound now lives — one budget per specialist rather than one for
   the whole turn.

   `selectAgent` is gone with them. It matched keywords against the raw
   message and could not tell "open the pod bay doors" from "how do I open a
   JAR file"; more to the point, nothing ever read its answer, so every
   request ran the same generalist loop regardless. Routing is now a decision
   the Supervisor makes about the actual request, and acts on. */

/**
 * Picks the provider and model for this turn.
 *
 * When the caller named one that cannot run — almost always a model chosen
 * from the picker, which lists far more models than the user has keys for —
 * this falls back to one that works rather than refusing to answer. The
 * substitution is always stated: `provider.selected` reports what actually
 * ran, and a notification says why it changed.
 */
async function selectProvider(h: RequestHandle, input: PlanInput) {
  try {
    return await providers.resolve({ provider: input.provider, model: input.model });
  } catch (e) {
    if (input.provider) {
      try {
        const fallback = await providers.resolve({});
        h.emit('notification', {
          level: 'warn',
          message:
            `${input.provider} is not configured, so ${fallback.provider.label} · ${fallback.model} ` +
            'answered instead. Add an API key in Settings to use the model you picked.',
        });
        return fallback;
      } catch {
        /* Nothing is available at all — report the original problem. */
      }
    }
    // A missing provider is a user-fixable configuration problem, not a crash.
    h.emit('notification', { level: 'error', message: (e as ProviderUnavailable).message });
    throw e;
  }
}

export async function plan(
  h: RequestHandle,
  input: PlanInput
): Promise<{ text: string; tokens?: number; toolRounds: number }> {
  h.emit('planner.stage', { stage: 'Understanding Request', description: 'Reading the prompt' });

  h.emit('planner.stage', { stage: 'Analyzing Context' });
  const conversationId = input.conversationId ?? (await db.newConversation()).id;
  const history_ = await db.recentMessages(conversationId, 10);

  /* ── On-device shortcut ─────────────────────────────────────────
     "Set the volume to 50%" is not a reasoning problem, and sending it to a
     model is how it ends up being explained rather than done. Anything that
     matches exactly runs here and answers in milliseconds; everything else
     falls through untouched. */
  const local = await tryLocalIntent(input.message);
  if (local) {
    h.emit('planner.stage', { stage: 'Executing', description: 'On-device command' });
    h.emit('response.chunk', { text: local.text });
    h.emit('planner.stage', { stage: 'Completed' });

    await db.addMessage(conversationId, 'user', input.message);
    await db.addMessage(conversationId, 'assistant', local.text, { provider: 'local', model: local.intent });
    return { text: local.text, toolRounds: 0 };
  }

  h.emit('planner.stage', { stage: 'Selecting Model' });

  /* ── Mode Detection & Offline Fallback ─────────────────────────── */
  const modeStatus = await determineMode();
  h.emit('mode_determined', { mode: modeStatus.mode, reason: modeStatus.reason });

  if (modeStatus.mode === 'offline' && input.provider && !['ollama', 'lmstudio'].includes(input.provider)) {
    input.provider = 'ollama'; // Force fallback to local
    input.model = undefined;
    h.emit('notification', {
      level: 'warn',
      message: 'Internet is unavailable. Automatically switching to local models. Please select a local model (Ollama or LM Studio) in the settings if you prefer a different one.'
    });
  }

  let { provider, model } = await selectProvider(h, input);
  
  if (modeStatus.mode === 'offline' && !provider.isLocal) {
    try {
      const fallback = await providers.resolve({ provider: 'ollama' });
      provider = fallback.provider;
      model = fallback.model;
      h.emit('notification', {
        level: 'warn',
        message: 'Internet is unavailable. Automatically switching to local models. Please select a local model (Ollama or LM Studio) in the settings if you prefer a different one.'
      });
    } catch (e) {
      h.emit('notification', {
        level: 'error',
        message: 'You are offline, but no local provider (Ollama/LM Studio) is configured. Please start a local model to continue.'
      });
      throw new Error('Offline but no local model configured.');
    }
  }

  h.emit('provider.selected', { provider: provider.id, model });

  /* Agent selection is the Supervisor's decision now, and it is made against
     the actual request rather than a keyword table — so it is emitted from
     there, once it means something. */

  /* Tools are offered only when the provider can actually use them. Handing
     schemas to a provider that ignores them wastes context and, worse, invites
     the model to describe a tool call in prose that nothing will execute. */

  /* Provider support is not the whole story. Ollama speaks the tools API for
     every tag, but a model with no tool training simply answers — and the two
     observed here answered "Copied!" and "Clipboard content: HELLO-EVA" while
     nothing ran at all. A model that cannot act must be told so, and the user
     must be told why, or the assistant quietly becomes a liar. */
  const modelCanUseTools = provider.supportsTools
    ? (await provider.modelSupportsTools?.(model)) ?? true
    : false;

  const schemas = modelCanUseTools ? tools.schemas() : [];

  if (provider.supportsTools && !modelCanUseTools) {
    h.emit('notification', {
      level: 'warn',
      message:
        `${model} cannot use tools, so it can answer but not act on your computer. ` +
        'Pick a tool-capable model to automate anything.',
    });
  }

  if (schemas.length) {
    h.emit('planner.stage', {
      stage: 'Preparing Tools',
      description: `${schemas.length} tool${schemas.length === 1 ? '' : 's'} available`,
    });
  }

  const toolNames = schemas.map((s) => s.function.name);

  /* Everything already known about this user, loaded once per turn. Cheap
     (a single indexed read) and it is what makes the assistant continuous
     rather than starting from zero every conversation. */
  setActiveProject(input.projectId);
  const [memories, brief] = await Promise.all([
    recallMemories(input.projectId),
    projectBrief(input.projectId),
  ]);

  /* The system prompt every agent shares. Each specialist appends its own
     brief to this; the shared half is what keeps them one assistant rather
     than a committee with different manners. */
  const baseSystem = String(
    systemPrompt(toolNames, memories, brief, schemas.length ? connections.summary() : '').content
  );

  const history: ChatMessage[] = history_.map((m) => ({
    role: m.role as ChatMessage['role'],
    content: m.content,
  }));

  /* ── Mode Detection & Crawling ─────────────────────────────────── */
  if (modeStatus.mode === 'online') {
    h.emit('planner.stage', { stage: 'Analyzing Context', description: 'Checking intent' });
    const isCommand = /^(open|play|turn on|write|create|run|start|generate|make|launch|set)\b/i.test(input.message.trim());
    if (!isCommand) {
      await runAgenticCrawl({ query: input.message, maxSources: 5, maxHops: 2 });
    }
  }

  let augmentedMessage = input.message;
  const ragChunks = await retrieveContext(input.message, 5);
  
  if (ragChunks.length > 0) {
    if (modeStatus.mode === 'offline') {
      const urls = Array.from(new Set(ragChunks.map(c => c.url)));
      h.emit('local_rag_retrieval', { chunk_count: urls.length, sources: urls });
    }
    
    const contextText = ragChunks.map((c, i) => `[Source ${i + 1}: ${c.url}]\n${c.text}`).join('\n\n');
    augmentedMessage = `User Query: ${input.message}\n\nRetrieved Context:\n${contextText}\n\nPlease answer the query thoroughly using the context provided.`;
  }

  /* ── Hand off to the Supervisor ──────────────────────────────────
     The loop that used to live here now lives in agents/specialist.ts, run
     once per specialist. This function keeps what is genuinely per-turn —
     provider choice, memory, persistence — and stops being the thing that
     also does the work. */
  const outcome = await supervise(h, {
    message: augmentedMessage,
    provider,
    model,
    baseSystem,
    history,
  });

  let finalText = outcome.text;
  if (ragChunks.length > 0) {
    const urls = Array.from(new Set(ragChunks.map(c => c.url)));
    finalText += `\n\n**Sources Consulted:**\n` + urls.map(url => {
      try { return `- [${new URL(url).hostname}](${url})`; } 
      catch { return `- ${url}`; }
    }).join('\n');
  }

  const rounds = outcome.toolRounds;
  const tokens: number | undefined = undefined;
  const leadAgent = outcome.agentsUsed[0] ?? 'planner';

  h.emit('planner.stage', { stage: 'Completed' });

  await db.addMessage(conversationId, 'user', input.message);
  await db.addMessage(conversationId, 'assistant', finalText, {
    provider: provider.id,
    model,
    tokens,
  });
  await db.logAgent(conversationId, leadAgent, provider.id, model);

  return { text: finalText, tokens, toolRounds: rounds };
}
