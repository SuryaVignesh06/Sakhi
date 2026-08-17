import type { ModelInfo, ProviderId } from './modelStore';

/**
 * The one place the frontend talks to the backend.
 *
 * Everything the assistant does — reasoning, tool execution, provider calls —
 * happens on the other side of this file. The frontend posts a message and then
 * only listens; the answer arrives over the event stream, never as an HTTP
 * response body. That is what keeps the UI incapable of inventing progress.
 */

/** Vite exposes only VITE_-prefixed vars; the fallback keeps dev zero-config. */
export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:3007';

export const EVENTS_URL =
  (import.meta.env.VITE_SSE_URL as string | undefined) ?? `${API_BASE}/api/events`;

/**
 * `replay=0`: this client keeps its own transcript, so replaying the previous
 * turn on a fresh load would show an answer to a question the user cannot see.
 */
export const LIVE_EVENTS_URL = `${EVENTS_URL}${EVENTS_URL.includes('?') ? '&' : '?'}replay=0`;

/* The picker and the backend name providers differently; neither should have to
   know about the other, so the translation lives here. */
const PROVIDER_MAP: Record<ProviderId, string> = {
  gemini: 'gemini',
  claude: 'anthropic',
  openai: 'openai',
  openrouter: 'openrouter',
  local: 'ollama',
};

/** The backend id for a picked model, or undefined to let the backend decide. */
export function backendProvider(m: ModelInfo | null): string | undefined {
  if (!m) return undefined;
  // "Local" covers two runtimes; the fetcher records which one in `description`.
  if (m.provider === 'local') return /LM Studio/i.test(m.description ?? '') ? 'lmstudio' : 'ollama';
  return PROVIDER_MAP[m.provider];
}

export interface SendResult {
  ok: boolean;
  requestId?: string;
  error?: string;
}

export async function sendChat(body: {
  message: string;
  conversationId?: string;
  provider?: string;
  model?: string;
  /** Scopes memory recall and storage to one project. */
  projectId?: string;
}): Promise<SendResult> {
  try {
    const r = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error ?? `Backend returned ${r.status}.` };
    return { ok: true, requestId: j.requestId };
  } catch (e) {
    return {
      ok: false,
      error:
        `Cannot reach the Sakhi backend at ${API_BASE}. ` +
        `Start it with "npm run dev" in the server folder. (${(e as Error).message})`,
    };
  }
}

export async function cancelChat(requestId?: string): Promise<void> {
  await fetch(`${API_BASE}/api/chat/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId }),
  }).catch(() => {});
}

/** Answers a permission prompt. The loop is genuinely blocked until this lands. */
export async function answerPermission(id: string, granted: boolean, remember = false): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/chat/permission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, granted, remember }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export interface ToolStatus {
  name: string;
  title: string;
  description: string;
  requiresPermission: boolean;
  implemented: boolean;
  source: { kind: 'builtin' } | { kind: 'connection'; connectionId: string };
}

export interface AgentInfo {
  name: string;
  title: string;
  purpose: string;
  tools: string[];
  usesConnectedApps: boolean;
}

/** The real specialists the Supervisor routes to. */
export async function fetchAgents(): Promise<AgentInfo[]> {
  try {
    const r = await fetch(`${API_BASE}/api/agents`, { signal: AbortSignal.timeout(4000) });
    return r.ok ? (await r.json()).agents ?? [] : [];
  } catch {
    return [];
  }
}

export async function fetchTools(): Promise<ToolStatus[]> {
  try {
    const r = await fetch(`${API_BASE}/api/tools`);
    if (!r.ok) return [];
    return (await r.json()).tools ?? [];
  } catch {
    return [];
  }
}

/**
 * Ask the backend to load a local model into memory now.
 *
 * Called when a local model is selected, so the weights are read off disk
 * while the user is still typing instead of after they hit send. Silent on
 * failure — a warm-up that did not happen costs time, not correctness.
 */
export async function preloadModel(provider: string, model: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/providers/${provider}/preload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
  } catch {
    /* Backend down or provider unknown — the turn will just load on demand. */
  }
}

export interface SystemInfo {
  cpu: number;
  mem: number;
  memUsedGb: number;
  memTotalGb: number;
  gpu: string | null;
  cores: number;
  cpuModel: string;
  platform: string;
  uptimeSec: number;
}

/** Real CPU/RAM from the backend. Null when it cannot be reached. */
export async function fetchSystem(): Promise<SystemInfo | null> {
  try {
    const r = await fetch(`${API_BASE}/api/system`, { signal: AbortSignal.timeout(2500) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function fetchHealth(): Promise<{ ok: boolean; database?: { ok: boolean } } | null> {
  try {
    const r = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2500) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/* ─── APP CONNECTIONS ─────────────────────────────────────────────────
   Connect an app and Sakhi asks it what it can do. Nothing about any
   specific app is written into this frontend — the action list on a card is
   whatever that app reported about itself. */

export interface DiscoveredTool {
  name: string;
  qualifiedName: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
}

export interface Connection {
  id: string;
  label: string;
  transport: 'stdio' | 'http';
  enabled: boolean;
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  serverName?: string;
  serverVersion?: string;
  tools: DiscoveredTool[];
  resourceCount: number;
  promptCount: number;
  error?: string;
  connectedAt?: number;
  catalogId?: string;
  credentials: { name: string; configured: boolean; masked: string | null }[];
}

export interface CatalogEntry {
  id: string;
  label: string;
  blurb: string;
  category: string;
  secrets?: { name: string; label: string; help?: string }[];
  inputs?: { name: string; label: string; placeholder?: string; help?: string }[];
  setupNote?: string;
}

/**
 * `reachable` is carried separately from the two lists because "you have no
 * apps" and "I cannot see your apps" look identical otherwise — an empty
 * panel — and only one of them is the user's problem to fix.
 */
export async function fetchConnections(): Promise<{
  connections: Connection[];
  catalog: CatalogEntry[];
  reachable: boolean;
}> {
  try {
    const r = await fetch(`${API_BASE}/api/connections`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { connections: [], catalog: [], reachable: false };
    return { ...(await r.json()), reachable: true };
  } catch {
    return { connections: [], catalog: [], reachable: false };
  }
}

/** Shared shape: every mutation returns the updated card or an error to show. */
type ConnResult = { ok: true; connection?: Connection } | { ok: false; error: string };

async function connMutate(path: string, init?: RequestInit): Promise<ConnResult> {
  try {
    const r = await fetch(`${API_BASE}/api/connections${path}`, init);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error ?? `Backend returned ${r.status}.` };
    return { ok: true, connection: j.connection };
  } catch (e) {
    return { ok: false, error: `Cannot reach the backend. (${(e as Error).message})` };
  }
}

export function connectFromCatalog(
  catalogId: string,
  body: { inputs?: Record<string, string>; secrets?: Record<string, string> }
): Promise<ConnResult> {
  return connMutate(`/catalog/${catalogId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function addCustomConnection(body: {
  id: string; label: string; transport: 'stdio' | 'http';
  command?: string; args?: string[]; url?: string;
  authSecret?: string; secrets?: Record<string, string>; env?: Record<string, string>;
}): Promise<ConnResult> {
  return connMutate('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const connectApp = (id: string) => connMutate(`/${id}/connect`, { method: 'POST' });
export const disconnectApp = (id: string) => connMutate(`/${id}/disconnect`, { method: 'POST' });
export const refreshApp = (id: string) => connMutate(`/${id}/refresh`, { method: 'POST' });
export const removeApp = (id: string) => connMutate(`/${id}`, { method: 'DELETE' });

/* ─── PROJECTS ────────────────────────────────────────────────────────
   A project is a workspace with its own memory. Chat happens inside one,
   so what Sakhi learns while working on it stays scoped to it. */

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  rootPath?: string | null;
  /** Standing brief prepended to the prompt while this project is active. */
  instructions?: string | null;
  memoryCount: number;
  updatedAt: string;
}

export interface ProjectMemory {
  id: string;
  content: string;
  kind: string;
  createdAt: string;
}

export async function fetchProjects(): Promise<Project[]> {
  try {
    const r = await fetch(`${API_BASE}/api/projects`, { signal: AbortSignal.timeout(4000) });
    return r.ok ? (await r.json()).projects ?? [] : [];
  } catch {
    return [];
  }
}

export async function createProject(body: {
  name: string; description?: string; rootPath?: string;
}): Promise<Project | null> {
  try {
    const r = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.ok ? (await r.json()).project : null;
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/projects/${id}`, { method: 'DELETE' });
    return r.ok;
  } catch {
    return false;
  }
}

export async function fetchProjectMemories(id: string): Promise<ProjectMemory[]> {
  try {
    const r = await fetch(`${API_BASE}/api/projects/${id}/memories`, {
      signal: AbortSignal.timeout(4000),
    });
    return r.ok ? (await r.json()).memories ?? [] : [];
  } catch {
    return [];
  }
}

/* ─── PROJECT INSTRUCTIONS + KNOWLEDGE ────────────────────────────────
   The Claude Projects idea: a project carries a standing brief and reference
   material that apply to every conversation inside it. */

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export async function updateProject(
  id: string,
  patch: { name?: string; description?: string; rootPath?: string; instructions?: string }
): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function fetchKnowledge(id: string): Promise<KnowledgeDoc[]> {
  try {
    const r = await fetch(`${API_BASE}/api/projects/${id}/knowledge`, {
      signal: AbortSignal.timeout(4000),
    });
    return r.ok ? (await r.json()).knowledge ?? [] : [];
  } catch {
    return [];
  }
}

export async function addKnowledge(
  id: string, title: string, content: string
): Promise<KnowledgeDoc | null> {
  try {
    const r = await fetch(`${API_BASE}/api/projects/${id}/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    return r.ok ? (await r.json()).document : null;
  } catch {
    return null;
  }
}

export async function deleteKnowledge(id: string, docId: string): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/projects/${id}/knowledge/${docId}`, { method: 'DELETE' });
    return r.ok;
  } catch {
    return false;
  }
}
