import type { AgentName } from '../events/protocol.js';
import type { ToolName } from '../tools/registry.js';

/**
 * Specialist agents and the contract they talk over.
 *
 * The shape here is what enforces the topology. Agents receive an `AgentTask`
 * and return an `AgentResult` — they have no way to address another agent,
 * because nothing in either type names one. Every handoff therefore has to go
 * back through the Supervisor, which is what keeps A→B→C→A from being
 * expressible at all rather than merely discouraged.
 *
 * The messages are structured rather than conversational for the same reason
 * a work ticket is: the Supervisor has to branch on the outcome, and
 * "I think that mostly worked" is not something you can branch on.
 */

/** What the Supervisor hands to one specialist. */
export interface AgentTask {
  id: string;
  agent: AgentName;
  /** What to achieve, stated as an outcome — never as a list of tool calls. */
  objective: string;
  /**
   * What earlier agents established. This is the only channel by which one
   * agent's output reaches another, and it passes through the Supervisor.
   */
  context?: string;
  /** How the Supervisor will judge the result. */
  successCriteria?: string;
}

export type AgentStatus = 'success' | 'partial' | 'failed';

/** What a specialist hands back. */
export interface AgentResult {
  taskId: string;
  agent: AgentName;
  status: AgentStatus;
  /** For the Supervisor to reason over, and to carry into the next task. */
  summary: string;
  /** Present when the agent could not finish. */
  error?: string;
  /** Tool rounds consumed, for the step budget. */
  rounds: number;
}

/**
 * A specialist.
 *
 * `tools` is the important field: an agent is defined mostly by what it is
 * *not* allowed to touch. Handing every agent the full registry would make
 * them all the same agent wearing different names — which is what the
 * previous keyword `selectAgent` amounted to, since nothing acted on its
 * answer.
 */
export interface AgentDefinition {
  name: AgentName;
  title: string;
  /** Shown to the Supervisor when it decides who should do the work. */
  purpose: string;
  /**
   * Built-in tools this agent may use. Tools contributed by connected apps
   * are matched separately, by `connectionTools`.
   */
  tools: ToolName[];
  /**
   * Whether this agent also receives the actions of connected apps. Only the
   * agents whose work is app-shaped get them, so a Coding agent's tool list
   * does not swell with every Notion action the moment Notion is connected.
   */
  connectionTools?: boolean;
  /** Appended to the system prompt when this agent runs. */
  brief: string;
}
