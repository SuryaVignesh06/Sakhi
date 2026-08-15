import {
  errorText, sseLines, ProviderUnavailable,
  type ModelInfo, type Provider, type StreamDelta, type StreamOptions, type StreamResult,
} from './types.js';

const ROOT = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini's native API. It differs from OpenAI's in three ways that matter:
 * auth is a query parameter, the system prompt is a separate field rather than
 * a message, and roles are "user"/"model" instead of "user"/"assistant".
 */
/**
 * Strips a JSON Schema down to the subset Gemini's function calling accepts.
 *
 * Gemini validates `functionDeclarations[].parameters` strictly and rejects
 * the whole request — HTTP 400, no reply at all — on the first field it does
 * not recognise. Our tool schemas carry an `x-primary` extension (see
 * tools/browser.ts) that tells the prose parser which parameter an unlabelled
 * argument belongs to. It is meaningful to us and meaningless to Google, and
 * it was failing every single turn with:
 *
 *   Unknown name "x-primary" at 'tools[0].function_declarations[0].parameters'
 *
 * Rather than allow-listing one field, this keeps only what the OpenAPI
 * subset documents and drops everything else — so any future `x-` extension,
 * `$schema`, or `additionalProperties` cannot break tool calling again.
 */
const GEMINI_SCHEMA_KEYS = new Set([
  'type', 'format', 'description', 'nullable', 'enum',
  'items', 'properties', 'required', 'minItems', 'maxItems',
]);

function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (!GEMINI_SCHEMA_KEYS.has(k)) continue;
    if (k === 'properties' && v && typeof v === 'object') {
      // Property NAMES are arbitrary keys, not schema keywords — recurse into
      // the values without filtering the keys themselves.
      const props: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(v as Record<string, unknown>)) {
        props[name] = geminiSchema(sub);
      }
      out[k] = props;
    } else if (k === 'items' || k === 'enum') {
      out[k] = k === 'enum' ? v : geminiSchema(v);
    } else {
      out[k] = geminiSchema(v);
    }
  }
  return out;
}

function geminiDeclaration(fn: { name: string; description?: string; parameters?: unknown }) {
  return {
    name: fn.name,
    ...(fn.description ? { description: fn.description } : {}),
    ...(fn.parameters ? { parameters: geminiSchema(fn.parameters) } : {}),
  };
}

export class GeminiProvider implements Provider {
  readonly id = 'gemini' as const;
  readonly label = 'Gemini';
  readonly isLocal = false;
  readonly supportsTools = true;

  constructor(private readonly getKey: () => string | undefined) {}

  async isConfigured() {
    return Boolean(this.getKey());
  }

  async listModels(): Promise<ModelInfo[]> {
    const key = this.getKey();
    if (!key) throw new ProviderUnavailable('gemini', 'No API key configured.');

    const r = await fetch(`${ROOT}/models?key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new ProviderUnavailable('gemini', await errorText(r));
    const j: any = await r.json();

    return (j.models ?? [])
      // The list also carries embedding and TTS models that cannot chat.
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any): ModelInfo => {
        const id = String(m.name).replace(/^models\//, '');
        return {
          id,
          name: m.displayName || id,
          contextWindow: m.inputTokenLimit,
          supportsVision: true,
          supportsTools: true,
          supportsThinking: /2\.5|3\./.test(id),
        };
      });
  }

  async *stream(opts: StreamOptions): AsyncGenerator<StreamDelta, StreamResult, void> {
    const key = this.getKey();
    if (!key) throw new ProviderUnavailable('gemini', 'No API key configured.');

    const system = opts.messages.find((m) => m.role === 'system');
    
    const contents = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'tool') {
          let responseObj = { content: m.content };
          try { responseObj = JSON.parse(m.content); } catch {}
          return {
            role: 'user',
            parts: [{ functionResponse: { name: m.name || m.toolCallId || 'tool', response: responseObj } }],
          };
        }
        if (m.toolCalls?.length) {
          return {
            role: 'model',
            parts: m.toolCalls.map(t => ({
              functionCall: { name: t.name, args: t.args }
            }))
          };
        }
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        };
      });

    const url =
      `${ROOT}/models/${encodeURIComponent(opts.model)}:streamGenerateContent` +
      `?alt=sse&key=${encodeURIComponent(key)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.signal,
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system.content }] } } : {}),
        ...(opts.tools?.length
          ? { tools: [{ functionDeclarations: opts.tools.map((t) => geminiDeclaration(t.function)) }] }
          : {}),
        generationConfig: {
          temperature: opts.temperature ?? 0.7,
          ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
        },
      }),
    });

    if (!res.ok) throw new ProviderUnavailable('gemini', await errorText(res));

    let tokens: number | undefined;
    const toolCalls: any[] = [];
    let finishReason: string | undefined;

    for await (const data of sseLines(res, opts.signal)) {
      let j: any;
      try { j = JSON.parse(data); } catch { continue; }

      if (j.usageMetadata?.candidatesTokenCount) tokens = j.usageMetadata.candidatesTokenCount;
      
      const candidate = j.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;

      for (const part of candidate?.content?.parts ?? []) {
        if (part.functionCall) {
          toolCalls.push({
            id: crypto.randomUUID(),
            name: part.functionCall.name,
            args: part.functionCall.args || {}
          });
        } else if (typeof part.text === 'string') {
          // 2.5+ marks reasoning parts; render those as thinking, not answer.
          if (part.thought) yield { thinking: part.text };
          else yield { text: part.text };
        }
      }
    }

    return { 
      tokens, 
      finishReason,
      ...(toolCalls.length ? { toolCalls } : {})
    };
  }
}
