/**
 * Sakhi Backend Event Protocol v1 — client side.
 *
 * One stream, discriminated by `type`. Adding Vision, Coding, or Plugin events
 * later means adding a `type` value and a case in the reducer; the transport
 * and the components never change.
 *
 * The frontend NEVER invents state. Every field the UI renders is written by an
 * event. If the backend goes quiet, the UI goes quiet — it does not animate a
 * guess. That is enforced structurally: the reducer is the only writer, and it
 * only ever runs in response to a received event.
 */

/* ─── ENVELOPE ────────────────────────────────────────────────────── */

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
  /** `id` is what POST /api/chat/permission is answered with. */
  | Envelope<'permission.required', { id: string; permission: string; reason: string }>
  /** Emitted when anyone answers, so every client clears the same prompt. */
  | Envelope<'permission.resolved', { id: string; granted: boolean }>
  | Envelope<'task.started', { taskId: string; title: string }>
  | Envelope<'task.updated', { taskId: string; progress: number }>
  | Envelope<'task.completed', { taskId: string }>
  | Envelope<'task.failed', { taskId: string; error: string }>
  /**
   * Client-only. The backend never sends this: a notice list is UI state, and
   * dismissing one is a local act. It is an event rather than a setState so the
   * reducer stays the only writer of session state.
   */
  | Envelope<'notice.dismissed', { id: string }>;

export type EventType = AppEvent['type'];

/* ─── SESSION STATE ───────────────────────────────────────────────── */

export interface ToolCall {
  tool: string;
  title?: string;
  status: 'running' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  duration?: number;
  error?: string;
  startedAt: number;
}

export interface TaskItem {
  taskId: string;
  title: string;
  progress: number;
  status: 'running' | 'completed' | 'failed';
  error?: string;
}

export interface StageEntry {
  stage: PlannerStage;
  description?: string;
  at: number;
}

export interface Notice {
  id: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface PermissionAsk {
  id: string;
  permission: string;
  reason: string;
}

export interface SessionState {
  /** True between the first event of a turn and response.completed. */
  active: boolean;
  conversationId?: string;
  provider?: string;
  model?: string;
  agent?: AgentName;
  stages: StageEntry[];
  /** Keyed by tool name so progress updates land on the right card. */
  tools: Record<string, ToolCall>;
  toolOrder: string[];
  thinking: string;
  response: string;
  tokens?: number;
  duration?: number;
  voice: VoiceState;
  tasks: Record<string, TaskItem>;
  taskOrder: string[];
  notices: Notice[];
  permissions: PermissionAsk[];
}

export const emptySession = (): SessionState => ({
  active: false,
  stages: [],
  tools: {},
  toolOrder: [],
  thinking: '',
  response: '',
  voice: 'idle',
  tasks: {},
  taskOrder: [],
  notices: [],
  permissions: [],
});

/**
 * The single writer. Pure, so it is trivially testable and cannot smuggle in
 * timers or guesses — everything it produces is a function of a received event.
 */
export function reduce(s: SessionState, e: AppEvent): SessionState {
  switch (e.type) {
    case 'conversation.started':
      return {
        ...emptySession(),
        active: true,
        voice: s.voice,
        conversationId: e.payload.conversationId,
        provider: e.payload.provider,
        model: e.payload.model,
      };

    case 'planner.stage':
      return {
        ...s,
        active: e.payload.stage !== 'Completed' ? true : s.active,
        stages: [...s.stages, { stage: e.payload.stage, description: e.payload.description, at: e.timestamp }],
      };

    case 'provider.selected':
      return { ...s, provider: e.payload.provider, model: e.payload.model };

    case 'agent.selected':
      return { ...s, agent: e.payload.agent };

    case 'tool.started': {
      const { tool, title } = e.payload;
      return {
        ...s,
        active: true,
        tools: { ...s.tools, [tool]: { tool, title, status: 'running', startedAt: e.timestamp } },
        toolOrder: s.toolOrder.includes(tool) ? s.toolOrder : [...s.toolOrder, tool],
      };
    }

    case 'tool.progress': {
      const cur = s.tools[e.payload.tool];
      if (!cur) return s; // progress for a tool we never saw start — ignore
      return {
        ...s,
        tools: { ...s.tools, [cur.tool]: { ...cur, progress: e.payload.progress, message: e.payload.message } },
      };
    }

    case 'tool.completed': {
      const cur = s.tools[e.payload.tool];
      if (!cur) return s;
      return {
        ...s,
        tools: {
          ...s.tools,
          [cur.tool]: { ...cur, status: 'completed', progress: 100, duration: e.payload.duration },
        },
      };
    }

    case 'tool.failed': {
      const cur = s.tools[e.payload.tool];
      if (!cur) return s;
      return { ...s, tools: { ...s.tools, [cur.tool]: { ...cur, status: 'failed', error: e.payload.error } } };
    }

    case 'thinking.chunk':
      return { ...s, active: true, thinking: s.thinking + e.payload.text };

    case 'response.chunk':
      return { ...s, active: true, response: s.response + e.payload.text };

    case 'response.completed':
      return { ...s, active: false, tokens: e.payload.tokens, duration: e.payload.duration };

    case 'voice.state':
      return { ...s, voice: e.payload.state };

    case 'notification':
      return {
        ...s,
        notices: [...s.notices, { id: e.id, level: e.payload.level, message: e.payload.message }],
      };

    case 'permission.required':
      return {
        ...s,
        permissions: [
          ...s.permissions,
          {
            // The payload id is the one the backend is waiting on. The envelope
            // id identifies the event, not the pending decision.
            id: e.payload.id ?? e.id,
            permission: e.payload.permission,
            reason: e.payload.reason,
          },
        ],
      };

    case 'notice.dismissed':
      return { ...s, notices: s.notices.filter((n) => n.id !== e.payload.id) };

    case 'permission.resolved':
      return { ...s, permissions: s.permissions.filter((p) => p.id !== e.payload.id) };

    case 'task.started': {
      const { taskId, title } = e.payload;
      return {
        ...s,
        tasks: { ...s.tasks, [taskId]: { taskId, title, progress: 0, status: 'running' } },
        taskOrder: s.taskOrder.includes(taskId) ? s.taskOrder : [...s.taskOrder, taskId],
      };
    }

    case 'task.updated': {
      const cur = s.tasks[e.payload.taskId];
      if (!cur) return s;
      return { ...s, tasks: { ...s.tasks, [cur.taskId]: { ...cur, progress: e.payload.progress } } };
    }

    case 'task.completed': {
      const cur = s.tasks[e.payload.taskId];
      if (!cur) return s;
      return { ...s, tasks: { ...s.tasks, [cur.taskId]: { ...cur, status: 'completed', progress: 100 } } };
    }

    case 'task.failed': {
      const cur = s.tasks[e.payload.taskId];
      if (!cur) return s;
      return { ...s, tasks: { ...s.tasks, [cur.taskId]: { ...cur, status: 'failed', error: e.payload.error } } };
    }

    case 'memory.updated':
      return s; // no visual surface yet

    default:
      // Unknown type: ignore rather than throw, so a newer backend can add
      // events without breaking an older frontend.
      return s;
  }
}

/* ─── TRANSPORT ───────────────────────────────────────────────────── */

export type ConnState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface StreamOptions {
  /** WebSocket URL. Falls back to SSE when the socket cannot be opened. */
  wsUrl?: string;
  sseUrl?: string;
  onEvent: (e: AppEvent) => void;
  onState?: (s: ConnState) => void;
}

function parse(raw: string): AppEvent | null {
  try {
    const o = JSON.parse(raw);
    // Envelope shape is the contract; anything else is dropped rather than
    // half-rendered.
    if (!o || typeof o.type !== 'string' || typeof o.id !== 'string') return null;
    if (typeof o.timestamp !== 'number') o.timestamp = Date.now();
    if (o.payload === undefined) o.payload = {};
    return o as AppEvent;
  } catch {
    return null;
  }
}

/**
 * Subscribes to the backend stream. Returns a disposer.
 * Tries WebSocket first, then SSE. Never polls, never simulates.
 */
export function connect({ wsUrl, sseUrl, onEvent, onState }: StreamOptions): () => void {
  let ws: WebSocket | null = null;
  let es: EventSource | null = null;
  let disposed = false;

  const set = (s: ConnState) => !disposed && onState?.(s);

  const openSse = () => {
    if (disposed || !sseUrl) return set('closed');
    try {
      set('connecting');
      es = new EventSource(sseUrl);
      es.onopen = () => set('open');
      es.onmessage = (m) => {
        const e = parse(m.data);
        if (e) onEvent(e);
      };
      es.onerror = () => set('error');
    } catch {
      set('error');
    }
  };

  if (wsUrl) {
    try {
      set('connecting');
      ws = new WebSocket(wsUrl);
      ws.onopen = () => set('open');
      ws.onmessage = (m) => {
        const e = parse(typeof m.data === 'string' ? m.data : '');
        if (e) onEvent(e);
      };
      ws.onerror = () => { ws?.close(); };
      ws.onclose = () => {
        if (disposed) return;
        // A closed socket is not an error state on its own — fall through to
        // SSE, and only then report failure.
        ws = null;
        if (sseUrl) openSse();
        else set('closed');
      };
    } catch {
      openSse();
    }
  } else {
    openSse();
  }

  return () => {
    disposed = true;
    ws?.close();
    es?.close();
  };
}

/** Convenience for building events in tests and dev harnesses. */
export function makeEvent<T extends AppEvent['type']>(
  type: T,
  payload: Extract<AppEvent, { type: T }>['payload']
): AppEvent {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    payload,
  } as AppEvent;
}
