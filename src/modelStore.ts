/**
 * Provider registry + model discovery.
 *
 * Nothing here is a hardcoded model list. Each provider declares how to fetch
 * its catalogue and how to normalise the response, so new models appear on
 * their own as providers ship them.
 *
 * CORS reality check — this matters and is not a design choice:
 *   OpenRouter  public /models endpoint, CORS-open        -> works from browser
 *   Gemini      ?key= query auth, CORS-open               -> works from browser
 *   Ollama      localhost, CORS-open                      -> works from browser
 *   LM Studio   localhost, CORS-open                      -> works from browser
 *   OpenAI      no CORS headers for /v1/models            -> needs a backend proxy
 *   Anthropic   requires an opt-in header, still fragile  -> needs a backend proxy
 * The two that cannot work are reported as blocked rather than silently empty.
 */

import { API_BASE } from './api';

export type ProviderId = 'gemini' | 'claude' | 'openai' | 'openrouter' | 'local';

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderId;
  contextWindow?: number;
  /** Prompt price per million tokens; 0 means free. */
  pricePer1M?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsThinking?: boolean;
  /** Local models only. */
  sizeBytes?: number;
  quantization?: string;
  recommended?: boolean;
  description?: string;
}

export interface FetchResult {
  models: ModelInfo[];
  error?: string;
  /** True when the browser cannot reach this provider without a backend. */
  blocked?: boolean;
}

export const PROVIDERS: {
  id: ProviderId;
  label: string;
  needsKey: boolean;
  keyHint: string;
  keyUrl?: string;
}[] = [
  { id: 'gemini', label: 'Gemini', needsKey: true, keyHint: 'AIza… or AQ.…', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'claude', label: 'Claude', needsKey: true, keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', needsKey: true, keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'openrouter', label: 'OpenRouter', needsKey: false, keyHint: 'sk-or-… (optional)', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'local', label: 'Local', needsKey: false, keyHint: 'no key needed' },
];

/* ─── KEY STORAGE ─────────────────────────────────────────────────────
 * Obfuscated at rest with a device-bound XOR pad. This is NOT encryption
 * and is deliberately labelled as such in the UI: a browser cannot keep a
 * secret from someone with access to the machine. Real protection needs
 * Electron's safeStorage, which requires the main process.
 */
const KEY_STORE = 'ff.keys.v1';
const PAD_STORE = 'ff.pad.v1';

function pad(): string {
  let p = localStorage.getItem(PAD_STORE);
  if (!p) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    p = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(PAD_STORE, p);
  }
  return p;
}

const xor = (text: string) => {
  const p = pad();
  return Array.from(text, (ch, i) =>
    String.fromCharCode(ch.charCodeAt(0) ^ p.charCodeAt(i % p.length))
  ).join('');
};

export function getKeys(): Partial<Record<ProviderId, string>> {
  try {
    const raw = localStorage.getItem(KEY_STORE);
    if (!raw) return {};
    return JSON.parse(xor(atob(raw)));
  } catch {
    return {};
  }
}

export function setKey(provider: ProviderId, key: string) {
  const all = getKeys();
  if (key.trim()) all[provider] = key.trim();
  else delete all[provider];
  localStorage.setItem(KEY_STORE, btoa(xor(JSON.stringify(all))));
}

export function maskKey(key: string) {
  if (key.length <= 10) return '••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/**
 * Which keys the BACKEND holds, which is the copy that actually matters.
 *
 * `testKey` stores the key server-side in the encrypted vault and also drops
 * a copy in localStorage. Only the localStorage copy was ever read back, so
 * anything that cleared browser storage — or a key set through an env var,
 * or one saved from a different window — showed as "no API key" even though
 * the agent could use it perfectly well. This asks the server instead.
 */
export async function fetchBackendKeys(): Promise<
  Partial<Record<ProviderId, { configured: boolean; masked: string | null; fromEnv: boolean }>>
> {
  try {
    const r = await fetch(`${API_BASE}/api/providers`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return {};
    const j = await r.json();
    const raw = j.keys ?? {};

    // The backend names providers by runtime; the UI names them by tab.
    const out: Partial<Record<ProviderId, any>> = {};
    for (const [id, backendId] of Object.entries(BACKEND_ID) as [ProviderId, string][]) {
      if (raw[backendId]) out[id] = raw[backendId];
    }
    return out;
  } catch {
    return {};
  }
}

/* ─── SELECTION ───────────────────────────────────────────────────── */
const SEL_STORE = 'ff.model.v1';

export function getSelected(): ModelInfo | null {
  try {
    const raw = localStorage.getItem(SEL_STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSelected(m: ModelInfo) {
  localStorage.setItem(SEL_STORE, JSON.stringify(m));
}

/* ─── FETCHERS ────────────────────────────────────────────────────── */

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

async function fetchGemini(key?: string): Promise<FetchResult> {
  if (!key) return { models: [], error: 'Add a Gemini API key to load models.' };
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
    );
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { models: [], error: `Google returned ${r.status}. ${body.slice(0, 90)}` };
    }
    const j = await r.json();
    const models: ModelInfo[] = (j.models ?? [])
      // Only chat-capable models; the list also carries embedding and TTS entries.
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => {
        const id = String(m.name ?? '').replace(/^models\//, '');
        return {
          id,
          name: m.displayName || id,
          provider: 'gemini' as const,
          contextWindow: num(m.inputTokenLimit),
          supportsVision: /vision|flash|pro/i.test(id),
          supportsTools: true,
          supportsThinking: /thinking|2\.5|3\./i.test(id),
          recommended: /2\.5-flash$|3\.5-flash$/i.test(id),
          description: m.description,
        };
      });
    return { models };
  } catch (e: any) {
    return { models: [], error: e?.message ?? 'Network error' };
  }
}

async function fetchOpenRouter(): Promise<FetchResult> {
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models');
    if (!r.ok) return { models: [], error: `OpenRouter returned ${r.status}` };
    const j = await r.json();
    const models: ModelInfo[] = (j.data ?? []).map((m: any) => {
      // OpenRouter quotes price per token; per-million is the readable unit.
      const price = num(m.pricing?.prompt) * 1_000_000;
      const mods: string[] = m.architecture?.input_modalities ?? [];
      return {
        id: m.id,
        name: m.name ?? m.id,
        provider: 'openrouter' as const,
        contextWindow: num(m.context_length),
        pricePer1M: price,
        supportsVision: mods.includes('image'),
        supportsTools: Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools'),
        supportsThinking:
          Array.isArray(m.supported_parameters) &&
          (m.supported_parameters.includes('reasoning') || m.supported_parameters.includes('include_reasoning')),
        recommended: price === 0 && num(m.context_length) >= 100_000,
        description: m.description,
      };
    });
    return { models };
  } catch (e: any) {
    return { models: [], error: e?.message ?? 'Network error' };
  }
}

async function fetchLocal(): Promise<FetchResult> {
  const out: ModelInfo[] = [];
  const notes: string[] = [];

  // Ollama
  try {
    const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const j = await r.json();
      for (const m of j.models ?? []) {
        const caps: string[] = m.capabilities ?? [];
        const nameLower = String(m.name ?? '').toLowerCase();
        const hasTools = caps.length > 0 ? caps.includes('tools') : !/embed/i.test(nameLower);
        const hasThinking = caps.length > 0 ? caps.includes('thinking') : /think|reason|deepseek-r1|qwq/i.test(nameLower);
        const hasVision = caps.length > 0 ? caps.includes('vision') : /vision|llava|bakllava/i.test(nameLower);

        out.push({
          id: m.name,
          name: m.name,
          provider: 'local',
          sizeBytes: num(m.size),
          quantization: m.details?.quantization_level,
          supportsTools: hasTools,
          supportsThinking: hasThinking,
          supportsVision: hasVision,
          recommended: true,
          description: `Ollama · ${m.details?.parameter_size ?? ''}`.trim(),
        });
      }
    }
  } catch {
    notes.push('Ollama not running on :11434');
  }

  // LM Studio (OpenAI-compatible)
  try {
    const r = await fetch('http://localhost:1234/v1/models', { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const j = await r.json();
      for (const m of j.data ?? []) {
        const nameLower = String(m.id ?? '').toLowerCase();
        out.push({
          id: m.id,
          name: m.id,
          provider: 'local',
          supportsTools: true,
          supportsThinking: /think|reason|r1/i.test(nameLower),
          description: 'LM Studio',
        });
      }
    }
  } catch {
    notes.push('LM Studio not running on :1234');
  }

  return { models: out, error: out.length ? undefined : notes.join(' · ') || 'No local server found.' };
}

/** Browsers cannot reach these directly — no CORS headers on their model APIs. */
function blockedProvider(name: string): FetchResult {
  return {
    models: [],
    blocked: true,
    error: `${name} blocks browser requests (no CORS). Model discovery needs the backend proxy.`,
  };
}

/* The backend proxy. It holds the keys in an encrypted vault and has no CORS
   restrictions, so it is the only way OpenAI and Anthropic can be listed at
   all — the browser cannot reach their /models endpoints. */
export const BACKEND_ID: Record<ProviderId, string> = {
  gemini: 'gemini',
  claude: 'anthropic',
  openai: 'openai',
  openrouter: 'openrouter',
  local: 'ollama',
};

async function fetchViaBackend(provider: ProviderId): Promise<FetchResult | null> {
  try {
    const r = await fetch(`${API_BASE}/api/providers/${BACKEND_ID[provider]}/models`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { models: [], error: j.error ?? `Backend returned ${r.status}` };
    }
    const j = await r.json();
    const models: ModelInfo[] = (j.models ?? []).map((m: any) => ({
      id: m.id,
      name: m.name ?? m.id,
      provider,
      contextWindow: num(m.contextWindow) || undefined,
      pricePer1M: typeof m.pricePer1M === 'number' ? m.pricePer1M : undefined,
      supportsVision: Boolean(m.supportsVision),
      supportsTools: Boolean(m.supportsTools),
      supportsThinking: Boolean(m.supportsThinking),
      description: m.description,
    }));
    return models.length ? { models } : null;
  } catch {
    return null;
  }
}

/** One local runtime, asked via the backend. Empty on any failure. */
async function fetchLocalBackend(runtime: 'ollama' | 'lmstudio'): Promise<ModelInfo[]> {
  try {
    const r = await fetch(`${API_BASE}/api/providers/${runtime}/models`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.models ?? []).map((m: any): ModelInfo => ({
      id: m.id,
      name: m.name ?? m.id,
      provider: 'local',
      supportsTools: Boolean(m.supportsTools),
      supportsThinking: Boolean(m.supportsThinking),
      supportsVision: Boolean(m.supportsVision),
      contextWindow: num(m.contextWindow) || undefined,
      recommended: true,
      description: runtime === 'ollama' ? 'Ollama' : 'LM Studio',
    }));
  } catch {
    return [];
  }
}

export async function fetchModels(provider: ProviderId): Promise<FetchResult> {
  const keys = getKeys();

  if (provider === 'local') {
    /**
     * Ask the backend about BOTH local runtimes, then the browser directly.
     *
     * Two bugs lived here. The backend path only ever asked for `ollama`, so
     * a running LM Studio was invisible unless the browser could reach it.
     * And the browser path is the one most likely to fail for a reason that
     * has nothing to do with whether the runtime is up: Ollama only sends
     * CORS headers to origins in OLLAMA_ORIGINS, and the Electron window is
     * not one of them by default. A blocked fetch looked identical to "not
     * running", which is why local models appeared missing while Ollama was
     * happily serving.
     *
     * The backend has no such restriction, so it is asked first and its
     * answer wins.
     */
    const [ollama, lmstudio, direct] = await Promise.all([
      fetchLocalBackend('ollama'),
      fetchLocalBackend('lmstudio'),
      fetchLocal(),
    ]);

    const merged: ModelInfo[] = [];
    const seen = new Set<string>();
    for (const list of [ollama, lmstudio, direct.models]) {
      for (const m of list) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        merged.push(m);
      }
    }

    if (merged.length) return { models: merged };

    return {
      models: [],
      error:
        `${direct.error ?? 'No local runtime found.'} ` +
        'The backend could not see one either — start Ollama or LM Studio, ' +
        'and check that the Sakhi server is running.',
    };
  }

  const viaBackend = await fetchViaBackend(provider);
  if (viaBackend && viaBackend.models.length > 0) return viaBackend;

  // Browser-only fallbacks, for when the backend is not running.
  switch (provider) {
    case 'gemini':
      return fetchGemini(keys.gemini);
    case 'openrouter':
      return fetchOpenRouter();
    case 'openai':
      return blockedProvider('OpenAI');
    case 'claude':
      return blockedProvider('Anthropic');
    default:
      return { models: [] };
  }
}

/** Round-trips a key against the provider so "Test" means something. */
export async function testKey(provider: ProviderId, key: string): Promise<{ ok: boolean; message: string }> {
  if (!key.trim()) return { ok: false, message: 'Enter a key first.' };

  /* Prefer the backend: it validates the key by listing models, then stores it
     AES-256-GCM encrypted in the vault. A key that only ever lived in
     localStorage was obfuscated, not encrypted, and could not be used by the
     agent loop at all — which runs server-side. */
  try {
    const r = await fetch(`${API_BASE}/api/providers/${BACKEND_ID[provider]}/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key.trim() }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) {
      return { ok: true, message: `Valid — ${j.models} models available. Stored encrypted.` };
    }
    if (j.error) return { ok: false, message: j.error };
  } catch {
    // Backend unreachable; fall back to what the browser can verify itself.
  }

  if (provider === 'gemini') {
    const r = await fetchGemini(key);
    return r.error ? { ok: false, message: r.error } : { ok: true, message: `Valid — ${r.models.length} models available.` };
  }
  if (provider === 'openrouter') {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` } });
      if (r.status === 401) return { ok: false, message: 'Key rejected by OpenRouter.' };
      if (!r.ok) return { ok: false, message: `OpenRouter returned ${r.status}.` };
      const j = await r.json();
      return { ok: true, message: `Valid${j?.data?.is_free_tier ? ' — free tier' : ''}.` };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? 'Network error' };
    }
  }
  return { ok: false, message: 'Cannot verify from the browser — needs the backend proxy.' };
}

export const fmtContext = (n?: number) =>
  !n ? '—' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `${Math.round(n / 1000)}K`;

export const fmtPrice = (p?: number) =>
  p === undefined ? '—' : p === 0 ? 'Free' : `$${p < 1 ? p.toFixed(3) : p.toFixed(2)}/M`;

export const fmtSize = (b?: number) => (!b ? '—' : `${(b / 1e9).toFixed(1)} GB`);
