import {
  errorText, ProviderUnavailable,
  type ChatMessage, type ModelInfo, type Provider,
  type StreamDelta, type StreamOptions, type StreamResult, type ToolCall,
} from './types.js';

/**
 * Ollama over its NATIVE /api/chat endpoint rather than the OpenAI-compatible
 * /v1 shim.
 *
 * This is not a stylistic preference. Measured on this machine with
 * phi4-mini:latest and one tool schema:
 *
 *   POST /v1/chat/completions  ->  content: "", tool_calls: absent, 61 tokens
 *   POST /api/chat             ->  content: "", tool_calls: [{ desktop, {...} }]
 *
 * The shim consumed the tool call and returned an empty turn, so the agentic
 * loop saw "no tools requested" and stopped. Every local model was therefore
 * incapable of automating anything, no matter how good the registry was.
 *
 * Two further differences the native endpoint gives us:
 *   - arguments arrive as a parsed object, not a JSON string streamed in
 *     fragments, so there is nothing to reassemble
 *   - thinking models expose `message.thinking` as its own field
 */

/** Frames are newline-delimited JSON, not SSE. */
async function* ndjson(res: Response, signal?: AbortSignal): AsyncGenerator<any, void, void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line);
        } catch {
          /* A partial frame cannot happen here — we split on newlines — so a
             parse failure means a malformed line. Skipping beats crashing. */
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export class OllamaProvider implements Provider {
  readonly id = 'ollama' as const;
  readonly label = 'Ollama';
  readonly isLocal = true;
  readonly supportsTools = true;

  /**
   * How long Ollama keeps a model resident after a request finishes.
   *
   * This is the single biggest lever on how fast a local model feels, and the
   * default works against us: Ollama evicts after 5 minutes, so a model that
   * took 20s to read off disk has to be read again on the next question. The
   * runtime is llama.cpp either way — the same engine LM Studio uses — so the
   * gap the user notices is not the engine, it is that LM Studio keeps the
   * weights loaded and Ollama throws them away.
   *
   * `-1` pins the model in memory until it is explicitly unloaded or the
   * server stops. Override with OLLAMA_KEEP_ALIVE (e.g. "30m") on a machine
   * where holding the VRAM is not wanted.
   */
  private readonly keepAlive: string | number;

  constructor(private readonly root = 'http://localhost:11434') {
    const raw = process.env.OLLAMA_KEEP_ALIVE;
    this.keepAlive = raw ? (/^-?\d+$/.test(raw) ? Number(raw) : raw) : -1;
  }

  /**
   * Reads the weights into memory without generating anything.
   *
   * `/api/generate` with an empty prompt is Ollama's documented load-only
   * call: it returns once the model is resident. Called when a local model is
   * picked, so the disk read overlaps with the user typing rather than with
   * them waiting on an answer.
   */
  async preload(model: string): Promise<boolean> {
    try {
      const r = await fetch(`${this.root}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: this.keepAlive }),
        // A cold load of a large model genuinely can take minutes on spinning
        // disks; cutting it off early would leave it half-warm for nothing.
        signal: AbortSignal.timeout(10 * 60_000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async isConfigured(): Promise<boolean> {
    try {
      const r = await fetch(`${this.root}/api/tags`, { signal: AbortSignal.timeout(1500) });
      return r.ok;
    } catch {
      return false;
    }
  }

  /** /api/tags carries capabilities, size and quantisation; /v1/models does not. */
  async listModels(): Promise<ModelInfo[]> {
    const r = await fetch(`${this.root}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new ProviderUnavailable('ollama', await errorText(r));
    const j: any = await r.json();

    return (j.models ?? []).map((m: any): ModelInfo => {
      const caps: string[] = m.capabilities ?? [];
      return {
        id: m.name,
        name: m.name,
        contextWindow: m.details?.context_length,
        // Reported by the runtime, not assumed. A model without "tools" here
        // will be filtered out of automation duty rather than failing mid-turn.
        supportsTools: caps.includes('tools'),
        supportsThinking: caps.includes('thinking'),
        supportsVision: caps.includes('vision') || undefined,
      };
    });
  }

  /**
   * Per-tag tool capability, cached for the process.
   *
   * `/api/tags` is the only place this is exposed, and it does not change
   * while the app runs unless a model is pulled — so one lookup is enough.
   */
  private toolCaps: Map<string, boolean> | null = null;

  async modelSupportsTools(model: string): Promise<boolean | undefined> {
    try {
      if (!this.toolCaps) {
        const list = await this.listModels();
        this.toolCaps = new Map(list.map((m) => [m.id, Boolean(m.supportsTools)]));
      }
      return this.toolCaps.get(model);
    } catch {
      return undefined; // cannot tell — do not block the turn over it
    }
  }

  /** Our ChatMessage shape -> Ollama's native message shape. */
  private wireMessages(messages: ChatMessage[]) {
    return messages.map((m) => {
      if (m.role === 'tool') {
        // Ollama matches tool results positionally and by name; it has no
        // tool_call_id field, so the name is what correlates.
        return { role: 'tool', content: m.content, tool_name: m.name };
      }
      if (m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content ?? '',
          tool_calls: m.toolCalls.map((t) => ({
            function: { name: t.name, arguments: t.args },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  async *stream(opts: StreamOptions): AsyncGenerator<StreamDelta, StreamResult, void> {
    const res = await fetch(`${this.root}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.signal,
      body: JSON.stringify({
        model: opts.model,
        messages: this.wireMessages(opts.messages),
        stream: true,
        // Keeps the weights resident between turns — see `keepAlive` above.
        keep_alive: this.keepAlive,
        options: {
          temperature: opts.temperature ?? 0.7,
          ...(opts.maxTokens ? { num_predict: opts.maxTokens } : {}),
        },
        ...(opts.tools?.length
          ? {
              tools: opts.tools.map((t) => ({
                type: 'function',
                function: {
                  name: t.function.name,
                  description: t.function.description,
                  parameters: t.function.parameters,
                },
              })),
            }
          : {}),
      }),
    });

    if (!res.ok) throw new ProviderUnavailable('ollama', await errorText(res));

    const calls: ToolCall[] = [];
    let tokens: number | undefined;
    let finishReason: string | undefined;

    for await (const frame of ndjson(res, opts.signal)) {
      if (frame.error) throw new ProviderUnavailable('ollama', String(frame.error));

      const msg = frame.message;
      if (msg) {
        // Thinking models put reasoning in its own field on the native API.
        if (msg.thinking) yield { thinking: String(msg.thinking) };
        if (msg.content) yield { text: String(msg.content) };

        for (const tc of msg.tool_calls ?? []) {
          const name = tc.function?.name;
          if (!name) continue;
          const raw = tc.function?.arguments;
          // Usually an object already; a few builds send a JSON string.
          let args: Record<string, unknown> = {};
          if (typeof raw === 'string') {
            try { args = JSON.parse(raw); } catch { args = { __parseError: raw }; }
          } else if (raw && typeof raw === 'object') {
            args = raw as Record<string, unknown>;
          }
          calls.push({ id: tc.id || crypto.randomUUID(), name, args });
        }
      }

      if (frame.done) {
        if (typeof frame.eval_count === 'number') tokens = frame.eval_count;
        finishReason = calls.length ? 'tool_calls' : frame.done_reason ?? 'stop';
      }
    }

    return { tokens, finishReason, ...(calls.length ? { toolCalls: calls } : {}) };
  }
}
