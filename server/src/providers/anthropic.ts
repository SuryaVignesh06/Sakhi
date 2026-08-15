import {
  errorText, sseLines, ProviderUnavailable,
  type ModelInfo, type Provider, type StreamDelta, type StreamOptions, type StreamResult,
} from './types.js';

const ROOT = 'https://api.anthropic.com/v1';
const VERSION = '2023-06-01';

/**
 * Anthropic's Messages API. Differences that matter: `x-api-key` rather than a
 * bearer token, a required version header, `max_tokens` is mandatory, the
 * system prompt is a top-level field, and the stream is a sequence of typed
 * events rather than uniform chat deltas.
 */
export class AnthropicProvider implements Provider {
  readonly id = 'anthropic' as const;
  readonly label = 'Claude';
  readonly isLocal = false;

  constructor(private readonly getKey: () => string | undefined) {}

  async isConfigured() {
    return Boolean(this.getKey());
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.getKey() ?? '',
      'anthropic-version': VERSION,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.getKey()) throw new ProviderUnavailable('anthropic', 'No API key configured.');

    const r = await fetch(`${ROOT}/models?limit=100`, { headers: this.headers() });
    if (!r.ok) throw new ProviderUnavailable('anthropic', await errorText(r));
    const j: any = await r.json();

    return (j.data ?? []).map((m: any): ModelInfo => ({
      id: m.id,
      name: m.display_name ?? m.id,
      // Not returned by the API; every current Claude model is 200K.
      contextWindow: 200_000,
      supportsVision: true,
      supportsTools: true,
      supportsThinking: /opus|sonnet/i.test(m.id),
    }));
  }

  async *stream(opts: StreamOptions): AsyncGenerator<StreamDelta, StreamResult, void> {
    if (!this.getKey()) throw new ProviderUnavailable('anthropic', 'No API key configured.');

    const system = opts.messages.find((m) => m.role === 'system');
    const messages = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(`${ROOT}/messages`, {
      method: 'POST',
      headers: this.headers(),
      signal: opts.signal,
      body: JSON.stringify({
        model: opts.model,
        messages,
        ...(system ? { system: system.content } : {}),
        // Required by the API — there is no "unlimited" option.
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!res.ok) throw new ProviderUnavailable('anthropic', await errorText(res));

    let tokens: number | undefined;
    for await (const data of sseLines(res, opts.signal)) {
      let j: any;
      try { j = JSON.parse(data); } catch { continue; }

      if (j.type === 'message_delta' && j.usage?.output_tokens) tokens = j.usage.output_tokens;

      if (j.type === 'content_block_delta') {
        if (j.delta?.type === 'thinking_delta' && j.delta.thinking) {
          yield { thinking: String(j.delta.thinking) };
        } else if (j.delta?.type === 'text_delta' && j.delta.text) {
          yield { text: String(j.delta.text) };
        }
      }
    }

    return { tokens };
  }
}
