import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  connect, emptySession, reduce,
  type AppEvent, type ConnState, type SessionState,
} from './events';

/**
 * Subscribes to the backend event stream and exposes the derived session.
 *
 * There is deliberately no fallback that fabricates progress: if no backend is
 * reachable, `conn` reports it and the session simply stays empty. The UI then
 * shows nothing rather than a fake timeline.
 */
export function useAssistantStream(opts?: { wsUrl?: string; sseUrl?: string; enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  const [session, dispatch] = useReducer(reduce, undefined, emptySession);
  const [conn, setConn] = useState<ConnState>('idle');

  /* Keep the disposer so a hot-reload or option change tears the old socket
     down before opening a new one. */
  const stop = useRef<null | (() => void)>(null);

  useEffect(() => {
    if (!enabled) return;
    stop.current?.();
    stop.current = connect({
      wsUrl: opts?.wsUrl,
      sseUrl: opts?.sseUrl,
      onEvent: dispatch,
      onState: setConn,
    });
    return () => {
      stop.current?.();
      stop.current = null;
    };
  }, [enabled, opts?.wsUrl, opts?.sseUrl]);

  /** Injects an event as though it arrived from the backend. */
  const push = useCallback((e: AppEvent) => dispatch(e), []);

  return { session, conn, push };
}

/** Convenience selectors so components do not recompute these per render. */
export function useSessionFlags(s: SessionState) {
  return useMemo(
    () => ({
      busy: s.active,
      recording: s.voice === 'recording' || s.voice === 'wakeword',
      speaking: s.voice === 'speaking',
      hasOutput: Boolean(s.response || s.stages.length || s.toolOrder.length),
    }),
    [s.active, s.voice, s.response, s.stages.length, s.toolOrder.length]
  );
}
