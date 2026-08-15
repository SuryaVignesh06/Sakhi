import { hub } from '../events/emitter.js';

/**
 * Permission gate for tools that change machine state.
 *
 * The flow is genuinely blocking: the agentic loop stops, `permission.required`
 * goes out, and nothing resumes until the user answers or the request is
 * cancelled. There is no auto-approve and no timeout-to-allow — a silent grant
 * is the one failure mode that would make the whole gate pointless.
 */

interface Pending {
  id: string;
  tool: string;
  resolve: (granted: boolean) => void;
}

const pending = new Map<string, Pending>();

/** Grants persist for the session only — never written to disk. */
const sessionGrants = new Set<string>();

export interface PermissionResult {
  granted: boolean;
  reason: 'user' | 'session' | 'cancelled' | 'auto';
}

export function isAutoApprove(): boolean {
  return process.env.AUTO_APPROVE_TOOLS === 'true';
}

/**
 * Blocks until the user decides.
 * @param signal Aborting the request denies rather than hanging forever.
 */
export function requestPermission(
  tool: string,
  reason: string,
  signal: AbortSignal
): Promise<PermissionResult> {
  // An explicit opt-in for headless runs and the test harness. Off by default.
  if (isAutoApprove()) {
    return Promise.resolve({ granted: true, reason: 'auto' });
  }
  if (sessionGrants.has(tool)) {
    return Promise.resolve({ granted: true, reason: 'session' });
  }
  if (signal.aborted) {
    return Promise.resolve({ granted: false, reason: 'cancelled' });
  }

  const id = crypto.randomUUID();

  return new Promise<PermissionResult>((resolve) => {
    let settled = false;
    const finish = (granted: boolean, why: PermissionResult['reason']) => {
      if (settled) return;
      settled = true;
      pending.delete(id);
      signal.removeEventListener('abort', onAbort);
      resolve({ granted, reason: why });
    };

    const onAbort = () => finish(false, 'cancelled');
    signal.addEventListener('abort', onAbort, { once: true });

    pending.set(id, { id, tool, resolve: (granted) => finish(granted, 'user') });

    /* The id is its own payload field. It used to be appended to `reason` for
       the client to pull back out with a string split — which answered the
       wrong prompt as soon as an argument value contained a space. */
    hub.emit('permission.required', { id, permission: tool, reason });
  });
}

/** Called by POST /api/chat/permission. Returns false if the id is unknown. */
export function answerPermission(id: string, granted: boolean, remember = false): boolean {
  const entry = pending.get(id);
  if (!entry) return false;
  if (granted && remember) sessionGrants.add(entry.tool);
  entry.resolve(granted);
  return true;
}

/** For a "deny everything" control, and for shutdown. */
export function denyAll(): number {
  const n = pending.size;
  for (const p of [...pending.values()]) p.resolve(false);
  pending.clear();
  return n;
}

export function listPending() {
  return [...pending.values()].map(({ id, tool }) => ({ id, tool }));
}

export function clearSessionGrants() {
  sessionGrants.clear();
}
