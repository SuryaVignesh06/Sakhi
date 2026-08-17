import type { RequestHandle } from '../orchestrator/orchestrator.js';
import type { ChatMessage, Provider, ToolCall } from '../providers/types.js';
import { tools, type ToolName } from '../tools/registry.js';
import { ProseToolGate } from '../planner/proseTools.js';
import { toolsFor } from './registry.js';
import type { AgentDefinition, AgentResult, AgentTask } from './types.js';

/**
 * Runs one specialist against one task.
 *
 * This is the agentic loop — stream, run any tools asked for, feed the results
 * back, repeat — scoped to a single agent's tool list and reporting a
 * structured outcome instead of raw prose.
 *
 * `stream` is the interesting parameter. When a single agent handles the whole
 * request its words are the answer, so they go straight to the user as they
 * arrive. When several agents are involved their output is working material
 * for the Supervisor, and streaming it would show the user three overlapping
 * half-answers before the real one.
 */

/** Per-agent cap. The Supervisor separately caps the number of agent steps. */
const MAX_TOOL_ROUNDS = 5;
const MAX_NUDGES = 2;

export interface RunOptions {
  provider: Provider;
  model: string;
  /** Emit the agent's prose to the user as it is produced. */
  stream: boolean;
  /** Prepended context: the system prompt the whole turn shares. */
  baseSystem: string;
  /** Prior conversation, for the single-agent path. */
  history?: ChatMessage[];
}

export async function runAgent(
  h: RequestHandle,
  agent: AgentDefinition,
  task: AgentTask,
  opts: RunOptions
): Promise<AgentResult & { text: string }> {
  const { provider, model } = opts;

  h.emit('agent.selected', { agent: agent.name });

  const schemas = provider.supportsTools ? toolsFor(agent) : [];

  /* The objective is stated as an outcome and the agent decides how. Handing
     it a procedure would make the Supervisor the thing doing the work, which
     is exactly the coupling the split is meant to remove. */
  const instruction = [
    task.context ? `What is already established:\n${task.context}` : '',
    `Your task: ${task.objective}`,
    task.successCriteria ? `Done means: ${task.successCriteria}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const system: ChatMessage = {
    role: 'system',
    content: [opts.baseSystem, agent.brief].filter(Boolean).join('\n\n'),
  };

  const messages: ChatMessage[] = [
    system,
    ...(opts.history ?? []),
    { role: 'user', content: instruction },
  ];

  let text = '';
  let rounds = 0;
  let nudges = 0;
  let toolsEnabled = schemas.length > 0;
  let failure: string | undefined;

  const modelRejectsTools = (e: unknown) =>
    /does not support tools|tools?\b.*not supported|unsupported.*tool/i.test(
      (e as Error)?.message ?? ''
    );

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let roundText = '';
    let result;
    let gate = new ProseToolGate(schemas);

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
              text += show;
              if (opts.stream) h.emit('response.chunk', { text: show });
            }
          }
        }
        break;
      } catch (e) {
        if (attempt === 0 && toolsEnabled && modelRejectsTools(e)) {
          toolsEnabled = false;
          continue;
        }
        /* Reported, not thrown: one specialist failing is a result the
           Supervisor can route around, not the end of the turn. */
        failure = (e as Error).message;
        return {
          taskId: task.id,
          agent: agent.name,
          status: 'failed',
          summary: `${agent.title} could not run: ${failure}`,
          error: failure,
          rounds,
          text,
        };
      }
    }

    const tail = gate.end();
    if (tail.text) {
      roundText += tail.text;
      text += tail.text;
      if (opts.stream) h.emit('response.chunk', { text: tail.text });
    }

    if (tail.retry && !result?.toolCalls?.length && nudges < MAX_NUDGES) {
      nudges += 1;
      messages.push({
        role: 'user',
        content:
          'That was not a tool call — it was printed as text, so nothing ran. ' +
          'Issue it as a real tool call now, or if no tool is needed, answer in plain prose.',
      });
      continue;
    }

    const calls: ToolCall[] = result?.toolCalls?.length ? result.toolCalls : tail.calls;
    if (!calls.length) break;

    if (round === MAX_TOOL_ROUNDS) {
      return {
        taskId: task.id,
        agent: agent.name,
        status: 'partial',
        summary:
          `${agent.title} stopped after ${MAX_TOOL_ROUNDS} tool rounds without finishing. ` +
          (text.slice(0, 400) || 'It produced no conclusion.'),
        rounds,
        text,
      };
    }

    rounds += 1;
    messages.push({ role: 'assistant', content: roundText, toolCalls: calls });

    for (const call of calls) {
      const output = await tools.invoke(call.name as ToolName, call.args, h);
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: output.slice(0, 8000),
      });

      /* A denial is the user's decision, not a malfunction. Surfacing it as a
         distinct status stops the Supervisor from retrying the same blocked
         action with a different agent. */
      try {
        const parsed = JSON.parse(output);
        if (parsed?.denied) {
          return {
            taskId: task.id,
            agent: agent.name,
            status: 'failed',
            summary: `The user declined ${call.name}, so nothing was changed.`,
            error: 'denied',
            rounds,
            text,
          };
        }
      } catch {
        /* Not JSON — a normal string result. */
      }
    }
  }

  return {
    taskId: task.id,
    agent: agent.name,
    status: 'success',
    summary: text.trim() || `${agent.title} completed the task.`,
    rounds,
    text,
  };
}
