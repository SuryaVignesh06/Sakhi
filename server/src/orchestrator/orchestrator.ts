import { hub } from '../events/emitter.js';
import type { EventType, PayloadOf } from '../events/protocol.js';

/**
 * Owns the lifecycle of a single user request.
 *
 * The Planner reasons; the Orchestrator runs. Keeping them apart means adding
 * browser automation or a coding agent later does not touch cancellation,
 * timing, or event ordering — those live here, once.
 *
 * Responsibilities:
 *   - assign a request id
 *   - track state (running | completed | failed | cancelled)
 *   - expose an AbortSignal so a Stop press really aborts the upstream fetch
 *   - serialise event emission so ordering is guaranteed
 *   - measure latency
 *   - clean up, exactly once, on every exit path
 */

export type RequestState = 'running' | 'completed' | 'failed' | 'cancelled';

export interface RequestHandle {
  id: string;
  state: RequestState;
  startedAt: number;
  /** Milliseconds, set on completion. */
  durationMs?: number;
  signal: AbortSignal;
  emit<T extends EventType>(type: T, payload: PayloadOf<T>): void;
  cancel(): void;
}

class Orchestrator {
  private active = new Map<string, { handle: RequestHandle; abort: AbortController }>();

  /**
   * Runs `work` under a fresh request. Returns when the work settles.
   * `finish` is invoked exactly once regardless of how the request ends.
   */
  async run<T>(
    work: (h: RequestHandle) => Promise<T>,
    opts?: { onFinish?: (h: RequestHandle) => void | Promise<void> }
  ): Promise<{ handle: RequestHandle; result?: T; error?: Error }> {
    const abort = new AbortController();
    const id = crypto.randomUUID();
    const startedAt = Date.now();

    const handle: RequestHandle = {
      id,
      state: 'running',
      startedAt,
      signal: abort.signal,
      // Routed through the hub so ordering is single-writer, and so a late
      // emit from a cancelled request is dropped rather than confusing the UI.
      emit: (type, payload) => {
        if (handle.state !== 'running') return;
        hub.emit(type, payload);
      },
      cancel: () => {
        if (handle.state !== 'running') return;
        handle.state = 'cancelled';
        abort.abort();
      },
    };

    this.active.set(id, { handle, abort });

    let result: T | undefined;
    let error: Error | undefined;

    try {
      result = await work(handle);
      if (handle.state === 'running') handle.state = 'completed';
    } catch (e) {
      const err = e as Error;
      // An abort is a cancellation, not a failure — do not surface it as one.
      if (abort.signal.aborted || err?.name === 'AbortError') {
        handle.state = 'cancelled';
      } else {
        handle.state = 'failed';
        error = err;
      }
    } finally {
      handle.durationMs = Date.now() - startedAt;
      this.active.delete(id);
      try {
        await opts?.onFinish?.(handle);
      } catch (e) {
        console.error('[orchestrator] onFinish threw:', (e as Error).message);
      }
    }

    return { handle, result, error };
  }

  cancel(id: string): boolean {
    const entry = this.active.get(id);
    if (!entry) return false;
    entry.handle.cancel();
    return true;
  }

  /** Used by a global Stop control. */
  cancelAll(): number {
    const n = this.active.size;
    for (const { handle } of this.active.values()) handle.cancel();
    return n;
  }

  list(): { id: string; state: RequestState; startedAt: number }[] {
    return [...this.active.values()].map(({ handle }) => ({
      id: handle.id,
      state: handle.state,
      startedAt: handle.startedAt,
    }));
  }
}

export const orchestrator = new Orchestrator();
