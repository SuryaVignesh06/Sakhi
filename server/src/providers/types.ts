/**
 * The one interface every provider implements.
 *
 * The frontend never learns which provider ran — it only sees
 * `provider.selected` and a stream of `response.chunk`. Swapping Gemini for a
 * local Ollama model changes nothing above this line.
 */

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama' | 'lmstudio';

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments. Providers stream these as JSON fragments. */
  args: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Set on an assistant turn that requested tools. */
  toolCalls?: ToolCall[];
  /** Set on a tool result, correlating back to the call. */
  toolCallId?: string;
  name?: string;
}

/** JSON Schema function definition handed to the model. */
export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  pricePer1M?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsThinking?: boolean;
}

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Aborts the upstream HTTP request when the user cancels. */
  signal?: AbortSignal;
  /** Offered to the model. Omit to disable tool calling for this turn. */
  tools?: ToolSchema[];
}

export interface StreamDelta {
  /** Visible answer text. */
  text?: string;
  /** Reasoning text, when the model exposes it separately. */
  thinking?: string;
}

export interface StreamResult {
  tokens?: number;
  /**
   * Tool calls the model requested, assembled from the stream. Present only
   * when it finished with `tool_calls` — the loop uses this to decide whether
   * to run tools and go around again, or stop.
   */
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'tool_calls' | 'length' | string;
}

/** Not every provider implements tool calling yet; the loop checks this. */
export interface ToolCapability {
  supportsTools: boolean;
}

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  /** True when this provider needs no API key (local runtimes). */
  readonly isLocal: boolean;
  /** Whether `stream()` honours `opts.tools`. Absent means no. */
  readonly supportsTools?: boolean;

  /**
   * Whether THIS model can call tools, when the provider can tell.
   *
   * Provider-level support is not enough: Ollama speaks the tools API for
   * every tag, but `Qwen:latest` and `gemma2:2b` have no tool training and
   * answer "Copied!" without calling anything. Knowing this up front is what
   * lets the turn say so instead of letting the model claim a fiction.
   *
   * `undefined` means "cannot tell" — treat as capable.
   */
  modelSupportsTools?(model: string): Promise<boolean | undefined>;

  /** Is this provider usable right now — key present, or server reachable. */
  isConfigured(): Promise<boolean>;

  listModels(): Promise<ModelInfo[]>;

  /**
   * Load a model into memory ahead of the first turn, if the runtime has a
   * way to. Local runtimes read many gigabytes off disk on a cold start, and
   * doing that while the user waits on a reply is the whole of the perceived
   * "local models are slow" problem.
   *
   * Best-effort: resolves either way and never throws.
   */
  preload?(model: string): Promise<boolean>;

  /**
   * Streams a completion. Implementations MUST yield as data arrives — never
   * buffer the whole reply — because the frontend renders token by token.
   */
  stream(opts: StreamOptions): AsyncGenerator<StreamDelta, StreamResult, void>;
}

/** Thrown when a provider is selected but cannot run. */
export class ProviderUnavailable extends Error {
  constructor(public providerId: ProviderId, message: string) {
    super(message);
    this.name = 'ProviderUnavailable';
  }
}

/* ─── SHARED SSE PARSING ──────────────────────────────────────────────
 * OpenAI, OpenRouter, LM Studio and Anthropic all stream `data:` lines.
 * One parser avoids four subtly different hand-rolled ones.
 */
export async function* sseLines(
  res: Response,
  signal?: AbortSignal
): AsyncGenerator<string, void, void> {
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

      // Frames are separated by a blank line; a partial frame stays in `buf`.
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line.startsWith('data:')) yield line.slice(5).trim();
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** Reads an error body without letting a huge HTML page into the message. */
export async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  return `HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`;
}
