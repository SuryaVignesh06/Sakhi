import { providers } from '../providers/manager.js';
import { systemPrompt } from '../providers/openaiCompatible.js';
import {
  ProviderUnavailable,
  type ChatMessage, type ProviderId, type ToolCall,
} from '../providers/types.js';
import type { RequestHandle } from '../orchestrator/orchestrator.js';
import type { AgentName } from '../events/protocol.js';

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
import { tools, type ToolName } from '../tools/registry.js';
import { ProseToolGate } from './proseTools.js';
import { db } from '../db/client.js';
import { setActiveProject } from '../tools/memory.js';

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

/** Hard stop on the agentic loop. Prevents a model looping on a failing tool. */
const MAX_TOOL_ROUNDS = 5;

/** How many times a malformed tool call is sent back for a retry. */
const MAX_NUDGES = 2;

/**
 * Routes to a specialist. Keyword-based for now: a model call to decide this
 * would double latency on every turn. When real specialists land this becomes
 * classification — the event contract does not change.
 */
function selectAgent(message: string): AgentName {
  const m = message.toLowerCase();
  if (/\b(browse|website|url|google|search the web|open .*\.com)\b/.test(m)) return 'browser';
  if (/\b(open|launch|start|window|clipboard|screenshot|notify)\b/.test(m)) return 'desktop';
  if (/\b(code|function|bug|refactor|typescript|python|compile)\b/.test(m)) return 'coding';
  if (/\b(remember|recall|memory|forget)\b/.test(m)) return 'memory';
  if (/\b(research|compare|summari[sz]e|find out)\b/.test(m)) return 'research';
  return 'planner';
}

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
  const history = await db.recentMessages(conversationId, 10);

  h.emit('planner.stage', { stage: 'Selecting Model' });
  const { provider, model } = await selectProvider(h, input);
  h.emit('provider.selected', { provider: provider.id, model });

  h.emit('planner.stage', { stage: 'Selecting Agent' });
  h.emit('agent.selected', { agent: selectAgent(input.message) });

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

  const messages: ChatMessage[] = [
    systemPrompt(toolNames, memories, brief),
    ...history.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
    { role: 'user', content: input.message },
  ];

  let finalText = '';
  let tokens: number | undefined;
  let rounds = 0;
  let nudges = 0;

  /* Tool support is a property of the MODEL, not the provider. Ollama speaks
     the tools API, but an individual tag like "Qwen:latest" may not implement
     it and returns HTTP 400 "does not support tools". Degrading to a plain
     completion is far better than failing the turn — the user still gets an
     answer, and is told why the tools were unavailable. */
  let toolsEnabled = schemas.length > 0;
  const modelRejectsTools = (e: unknown) =>
    /does not support tools|tools?\b.*not supported|unsupported.*tool/i.test((e as Error)?.message ?? '');

  /* ── The agentic loop ────────────────────────────────────────────
     Each pass: stream the model, and if it asked for tools, run them, append
     the results, and go around again. Exits when the model stops asking. */
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    h.emit('planner.stage', {
      stage: round === 0 ? 'Generating Response' : 'Executing',
      ...(round > 0 ? { description: `Continuing after tool round ${round}` } : {}),
    });

    let roundText = '';
    let result;
    /* Holds back the opening characters of the round so a model that "calls" a
       tool by printing JSON never leaks that JSON into the answer. */
    let gate = new ProseToolGate(schemas);

    // One retry, tools stripped, if the model rejects them outright.
    for (let attempt = 0; ; attempt++) {
      try {
        gate = new ProseToolGate(schemas);
        const it = provider.stream({
          model,
          messages,
          signal: h.signal,
          ...(toolsEnabled ? { tools: schemas } : {}),
        });

        while (true) {
          const { value, done } = await it.next();
          if (done) {
            result = value;
            break;
          }
          if (value.thinking) h.emit('thinking.chunk', { text: value.thinking });
          if (value.text) {
            const show = gate.push(value.text);
            if (show) {
              roundText += show;
              finalText += show;
              h.emit('response.chunk', { text: show });
            }
          }
        }
        break;
      } catch (e) {
        if (attempt === 0 && toolsEnabled && modelRejectsTools(e)) {
          toolsEnabled = false;
          h.emit('notification', {
            level: 'warn',
            message: `${model} does not support tool calling — answering without tools.`,
          });
          continue;
        }
        throw e;
      }
    }

    if (result?.tokens) tokens = (tokens ?? 0) + result.tokens;

    /* Close the gate. `text` is whatever was held back and turned out to be a
       real answer — showing it now keeps the transcript complete. */
    const tail = gate.end();
    if (tail.text) {
      roundText += tail.text;
      finalText += tail.text;
      h.emit('response.chunk', { text: tail.text });
    }

    /* The model plainly tried to call a tool and produced something unreadable.
       One corrective nudge is far better than either showing the user a JSON
       blob or silently dropping the request. Budgeted so a model that cannot
       get it right cannot spin. */
    if (tail.retry && !result?.toolCalls?.length && nudges < MAX_NUDGES) {
      nudges += 1;
      h.emit('planner.stage', { stage: 'Executing', description: 'Retrying the tool call' });
      messages.push({
        role: 'user',
        content:
          'That was not a tool call — it was printed as text, so nothing ran. ' +
          'Issue it as a real tool call now, or if no tool is needed, answer in plain prose.',
      });
      continue;
    }

    // A protocol-level call always wins; the prose parse is only a fallback.
    const calls: ToolCall[] = result?.toolCalls?.length ? result.toolCalls : tail.calls;
    if (!calls.length) break; // the model is done

    if (round === MAX_TOOL_ROUNDS) {
      // Out of budget. Tell the user rather than silently truncating.
      h.emit('notification', {
        level: 'warn',
        message: `Stopped after ${MAX_TOOL_ROUNDS} tool rounds without a final answer.`,
      });
      break;
    }

    rounds += 1;
    h.emit('planner.stage', {
      stage: 'Executing',
      description: `Running ${calls.map((c) => c.name).join(', ')}`,
    });

    // Record the assistant turn that requested the tools, then each result.
    messages.push({ role: 'assistant', content: roundText, toolCalls: calls });

    for (const call of calls) {
      // invoke() handles permission, events, and error capture. It returns a
      // string on every path, including denial, so the loop always continues.
      const output = await tools.invoke(call.name as ToolName, call.args, h);
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        // Cap the payload: a huge tool result can blow the context window.
        content: output.slice(0, 8000),
      });
    }
  }

  h.emit('planner.stage', { stage: 'Completed' });

  await db.addMessage(conversationId, 'user', input.message);
  await db.addMessage(conversationId, 'assistant', finalText, {
    provider: provider.id,
    model,
    tokens,
  });
  await db.logAgent(conversationId, selectAgent(input.message), provider.id, model);

  return { text: finalText, tokens, toolRounds: rounds };
}
