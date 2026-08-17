import type { RequestHandle } from '../orchestrator/orchestrator.js';
import type { ChatMessage, Provider } from '../providers/types.js';
import type { AgentName } from '../events/protocol.js';
import { getAgent, roster } from './registry.js';
import { runAgent } from './specialist.js';
import type { AgentResult, AgentTask } from './types.js';

/**
 * The Supervisor.
 *
 * It coordinates; it does not do the work. Its job is to decide what the user
 * is actually after, choose who should handle it, sequence them, read what
 * came back, and decide whether the objective has been met.
 *
 * The topology is a star and stays one. Specialists are invoked from here and
 * return here; they cannot address each other, so a result only ever reaches
 * another agent as `context` that this file chose to pass on. That is what
 * makes the state here the single source of truth rather than one opinion
 * among several.
 */

/** Hard cap on agent dispatches. Stops a plan from grinding indefinitely. */
const MAX_AGENT_STEPS = 4;

export interface SupervisorInput {
  message: string;
  provider: Provider;
  model: string;
  baseSystem: string;
  history: ChatMessage[];
}

export interface SupervisorOutcome {
  text: string;
  agentsUsed: AgentName[];
  toolRounds: number;
}

/* ── Triage ──────────────────────────────────────────────────────────
   Most messages are conversation, and conversation should not pay for a
   planning round-trip. This catches the obvious cases before any model call:
   no imperative, no app or system noun, short. Anything else goes to the
   model, because guessing from keywords is what the previous router did and
   it could not tell "open the pod bay doors" from "how do I open a JAR". */

const ACTION_HINT =
  /\b(open|launch|start|run|play|search|find|look up|browse|go to|create|make|write|add|delete|remove|move|rename|fix|update|change|edit|install|send|post|commit|push|schedule|book|remind|check|read|list|show me|organise|organize|clean|sort|download|upload|close|click|type)\b/i;

const SUBJECT_HINT =
  /\b(file|files|folder|browser|chrome|tab|app|vs ?code|terminal|clipboard|repo|repository|git|github|notion|issue|pr|pull request|task|tasks|calendar|event|meeting|email|note|notes|project|screen|window|disk|battery|memory|song|music|video|youtube|website|page|url|http)\b/i;

function obviouslyConversational(msg: string): boolean {
  const m = msg.trim();
  if (m.length > 180) return false;
  if (ACTION_HINT.test(m) || SUBJECT_HINT.test(m)) return false;
  return true;
}

/** Collects a non-streamed completion. Used for the planning calls. */
async function complete(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  const it = provider.stream({ model, messages, signal, temperature: 0 });
  let out = '';
  while (true) {
    const { value, done } = await it.next();
    if (done) break;
    if (value.text) out += value.text;
  }
  return out;
}

/** Pulls the first JSON object out of a reply that may be fenced or prefaced. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

interface Plan {
  mode: 'direct' | 'delegate';
  steps: { agent: AgentName; objective: string; successCriteria?: string }[];
}

/**
 * Decides who should do the work.
 *
 * Returns a plan, not an answer. Asking for both in one call reliably produced
 * the answer and an empty plan — the model would rather help immediately than
 * describe how it would help.
 */
async function makePlan(
  h: RequestHandle,
  input: SupervisorInput
): Promise<Plan> {
  const prompt: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You route a personal assistant\'s work to specialists. Reply with JSON only.\n\n' +
        `Specialists available:\n${roster()}\n\n` +
        'Reply in this shape:\n' +
        '{"mode":"direct"} — the request is conversation, an explanation, or something ' +
        'you can answer from knowledge alone, needing no action on the computer.\n' +
        '{"mode":"delegate","steps":[{"agent":"browser","objective":"…","successCriteria":"…"}]} — ' +
        'the request needs action.\n\n' +
        'Use one step when one specialism covers it. Use several, in order, only when ' +
        'later work genuinely depends on what earlier work produces. Never exceed ' +
        `${MAX_AGENT_STEPS} steps. Write each objective as an outcome, not as tool calls.`,
    },
    ...input.history.slice(-4),
    { role: 'user', content: input.message },
  ];

  let parsed: unknown = null;
  try {
    parsed = extractJson(await complete(input.provider, input.model, prompt, h.signal));
  } catch {
    /* Planning failed — fall through to the generalist below. */
  }

  const p = parsed as Partial<Plan> | null;

  if (p?.mode === 'delegate' && Array.isArray(p.steps) && p.steps.length) {
    const steps = p.steps
      .filter((s) => s && typeof s.objective === 'string' && getAgent(s.agent))
      .slice(0, MAX_AGENT_STEPS);
    if (steps.length) return { mode: 'delegate', steps };
  }

  /* Anything unparseable becomes a direct answer rather than an error. A
     router that cannot decide must not be the reason the turn fails. */
  return { mode: 'direct', steps: [] };
}

export async function supervise(
  h: RequestHandle,
  input: SupervisorInput
): Promise<SupervisorOutcome> {
  /* `Understanding Request` is emitted by the caller, which owns the start of
     the turn. Emitting it here too put the stage on screen twice. */
  const generalist = getAgent('planner')!;

  /* ── Fast path ─────────────────────────────────────────────────
     Conversation goes straight to the generalist, streaming, with no
     planning call in front of it. */
  if (obviouslyConversational(input.message)) {
    const r = await runAgent(
      h, generalist,
      { id: crypto.randomUUID(), agent: 'planner', objective: input.message },
      { provider: input.provider, model: input.model, stream: true,
        /* Tools stay available in case the heuristic misjudged, but the
           default is reversed: asked the capital of Japan, the generalist
           otherwise ran a web search before answering "Tokyo" — correct, and
           four seconds slower than it needed to be. */
        baseSystem:
          `${input.baseSystem}\n\n` +
          'This looks like conversation or a question you can answer from what you ' +
          'already know. Answer directly. Reach for a tool only if the answer truly ' +
          'depends on this machine, on a specific page, or on something recent.',
        history: input.history }
    );
    return { text: r.text, agentsUsed: ['planner'], toolRounds: r.rounds };
  }

  h.emit('planner.stage', { stage: 'Planning', description: 'Deciding who should handle this' });
  const plan = await makePlan(h, input);

  if (plan.mode === 'direct') {
    const r = await runAgent(
      h, generalist,
      { id: crypto.randomUUID(), agent: 'planner', objective: input.message },
      { provider: input.provider, model: input.model, stream: true,
        baseSystem: input.baseSystem, history: input.history }
    );
    return { text: r.text, agentsUsed: ['planner'], toolRounds: r.rounds };
  }

  /* ── Single specialist ─────────────────────────────────────────
     One agent, so its words are the answer: stream them, and skip the
     composition call entirely. */
  if (plan.steps.length === 1) {
    const step = plan.steps[0];
    const agent = getAgent(step.agent)!;
    h.emit('planner.stage', { stage: 'Executing', description: `${agent.title} agent` });

    const r = await runAgent(
      h, agent,
      { id: crypto.randomUUID(), agent: step.agent, objective: step.objective,
        successCriteria: step.successCriteria },
      { provider: input.provider, model: input.model, stream: true,
        baseSystem: input.baseSystem, history: input.history }
    );
    return { text: r.text, agentsUsed: [step.agent], toolRounds: r.rounds };
  }

  /* ── Several specialists ───────────────────────────────────────
     Run in order, each seeing what the previous ones established — passed
     through here, never agent to agent. */
  const results: AgentResult[] = [];
  const used: AgentName[] = [];
  let totalRounds = 0;

  for (const [i, step] of plan.steps.entries()) {
    const agent = getAgent(step.agent);
    if (!agent) continue;

    h.emit('planner.stage', {
      stage: 'Executing',
      description: `${agent.title} agent (${i + 1} of ${plan.steps.length})`,
    });

    const task: AgentTask = {
      id: crypto.randomUUID(),
      agent: step.agent,
      objective: step.objective,
      successCriteria: step.successCriteria,
      context: results.length
        ? results.map((r) => `${r.agent}: ${r.summary}`).join('\n')
        : undefined,
    };

    const r = await runAgent(h, agent, task, {
      provider: input.provider,
      model: input.model,
      stream: false,
      baseSystem: input.baseSystem,
    });

    results.push(r);
    used.push(step.agent);
    totalRounds += r.rounds;

    /* A refusal ends the plan. Later steps were premised on this one, and
       running them anyway produces confident work built on nothing. */
    if (r.error === 'denied') break;
  }

  h.emit('planner.stage', { stage: 'Generating Response', description: 'Pulling it together' });

  const text = await compose(h, input, results);
  return { text, agentsUsed: used, toolRounds: totalRounds };
}

/**
 * Turns what the specialists did into one answer.
 *
 * The statuses are stated plainly in the prompt so a partial run is reported
 * as partial. A composer given only the prose tends to narrate a clean success
 * regardless of what actually happened — which is the failure mode this whole
 * architecture exists to avoid.
 */
async function compose(
  h: RequestHandle,
  input: SupervisorInput,
  results: AgentResult[]
): Promise<string> {
  const record = results
    .map((r) => `[${r.agent} — ${r.status}] ${r.summary}${r.error ? ` (error: ${r.error})` : ''}`)
    .join('\n\n');

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        `${input.baseSystem}\n\n` +
        'Several specialists worked on this request. Below is what each one reported. ' +
        'Tell the user what actually happened, in a sentence or two, in your own voice.\n' +
        '- Report anything marked failed or partial as exactly that. Never describe a ' +
        'failed step as done.\n' +
        '- If a step was declined by the user, say plainly that nothing was changed.\n' +
        '- Do not list the agents or narrate the process; the user cares about the outcome.',
    },
    { role: 'user', content: `The request was: ${input.message}\n\nWhat the specialists reported:\n${record}` },
  ];

  let out = '';
  const it = input.provider.stream({
    model: input.model,
    messages,
    signal: h.signal,
  });
  while (true) {
    const { value, done } = await it.next();
    if (done) break;
    if (value.text) {
      out += value.text;
      h.emit('response.chunk', { text: value.text });
    }
  }
  return out;
}
