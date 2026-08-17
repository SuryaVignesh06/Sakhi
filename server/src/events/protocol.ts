/**
 * Backend Event Protocol v1 — server side.
 *
 * This mirrors src/events.ts in the frontend exactly. It is duplicated rather
 * than imported because the two are separate TypeScript projects with separate
 * builds; the duplication is the seam, and it is deliberate. If you change a
 * payload here, change it there in the same commit.
 */

export interface Envelope<T extends string = string, P = unknown> {
  id: string;
  type: T;
  timestamp: number;
  payload: P;
}

export type PlannerStage =
  | 'Understanding Request' | 'Analyzing Context' | 'Planning' | 'Selecting Agent'
  | 'Selecting Model' | 'Preparing Tools' | 'Executing' | 'Generating Response' | 'Completed';

export type AgentName =
  | 'planner' | 'browser' | 'desktop' | 'coding' | 'memory'
  | 'vision' | 'research' | 'voice' | 'automation';

export type VoiceState =
  | 'idle' | 'wakeword' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export type AppEvent =
  | Envelope<'conversation.started', { conversationId: string; provider: string; model: string }>
  | Envelope<'planner.stage', { stage: PlannerStage; description?: string }>
  | Envelope<'provider.selected', { provider: string; model: string }>
  | Envelope<'agent.selected', { agent: AgentName }>
  | Envelope<'tool.started', { tool: string; title?: string }>
  | Envelope<'tool.progress', { tool: string; progress: number; message?: string }>
  | Envelope<'tool.completed', { tool: string; duration: number; status?: string }>
  | Envelope<'tool.failed', { tool: string; error: string }>
  | Envelope<'thinking.chunk', { text: string }>
  | Envelope<'response.chunk', { text: string }>
  | Envelope<'response.completed', { tokens?: number; duration?: number }>
  | Envelope<'memory.updated', { memoryId: string }>
  | Envelope<'voice.state', { state: VoiceState }>
  | Envelope<'notification', { level: 'info' | 'warn' | 'error' | 'success'; message: string }>
  /** `id` is the correlation key POST /api/chat/permission answers with. */
  | Envelope<'permission.required', { id: string; permission: string; reason: string }>
  | Envelope<'permission.resolved', { id: string; granted: boolean }>
  | Envelope<'task.started', { taskId: string; title: string }>
  | Envelope<'task.updated', { taskId: string; progress: number }>
  | Envelope<'task.completed', { taskId: string }>
  | Envelope<'task.failed', { taskId: string; error: string }>
  | Envelope<'mode_determined', { mode: 'online' | 'offline'; reason?: string }>
  | Envelope<'discovery_start', { query: string }>
  | Envelope<'discovery_complete', { query: string; candidate_count?: number }>
  | Envelope<'frontier_select', { url: string; domain: string; reason: string; reasoning_provider: 'gemini' | 'openrouter'; source: 'candidate_pool' | 'discovered_link'; depth: number }>
  | Envelope<'source_fetch_start', { id: string; url: string; domain: string; favicon_url: string }>
  | Envelope<'source_fetch_complete', { id: string; url: string; domain: string; favicon_url: string; success: boolean }>
  | Envelope<'embedding_start', { chunk_count?: number }>
  | Envelope<'embedding_complete', { chunk_count?: number }>
  | Envelope<'rag_indexed', { chunk_count?: number }>
  | Envelope<'local_rag_retrieval', { chunk_count: number; sources: string[] }>
  | Envelope<'search_trace_complete', { total_sources: number; total_hops: number }>;

export type EventType = AppEvent['type'];
export type PayloadOf<T extends EventType> = Extract<AppEvent, { type: T }>['payload'];

/** Builds a well-formed envelope. The only supported way to create an event. */
export function makeEvent<T extends EventType>(type: T, payload: PayloadOf<T>): AppEvent {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    payload,
  } as AppEvent;
}
