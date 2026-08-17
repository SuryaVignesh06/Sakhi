import {
  errorText, sseLines, ProviderUnavailable,
  type ChatMessage, type ModelInfo, type Provider, type ProviderId,
  type StreamDelta, type StreamOptions, type StreamResult, type ToolCall,
} from './types.js';


/**
 * OpenAI, OpenRouter, LM Studio and Ollama all speak the OpenAI wire format.
 * One implementation covers them; each concrete provider supplies its base URL,
 * auth, and whether a key is required.
 */
export class OpenAICompatibleProvider implements Provider {
  constructor(
    readonly id: ProviderId,
    readonly label: string,
    private readonly cfg: {
      baseUrl: string;
      /** Absent for local runtimes. */
      getKey?: () => string | undefined;
      isLocal?: boolean;
      extraHeaders?: Record<string, string>;
    }
  ) {}

  get isLocal() {
    return this.cfg.isLocal ?? false;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', ...this.cfg.extraHeaders };
    const key = this.cfg.getKey?.();
    if (key) h.Authorization = `Bearer ${key}`;
    return h;
  }

  async isConfigured(): Promise<boolean> {
    if (this.isLocal) {
      try {
        const r = await fetch(`${this.cfg.baseUrl}/models`, { signal: AbortSignal.timeout(1500) });
        return r.ok;
      } catch {
        return false;
      }
    }
    return Boolean(this.cfg.getKey?.());
  }

  async listModels(): Promise<ModelInfo[]> {
    const r = await fetch(`${this.cfg.baseUrl}/models`, { headers: this.headers() });
    if (!r.ok) throw new ProviderUnavailable(this.id, await errorText(r));
    const j: any = await r.json();

    return (j.data ?? []).map((m: any): ModelInfo => {
      // OpenRouter enriches the standard shape; the rest return only an id.
      const price = m.pricing?.prompt ? Number(m.pricing.prompt) * 1_000_000 : undefined;
      const mods: string[] = m.architecture?.input_modalities ?? [];
      const params: string[] = m.supported_parameters ?? [];
      return {
        id: m.id,
        name: m.name ?? m.id,
        contextWindow: m.context_length ? Number(m.context_length) : undefined,
        pricePer1M: price,
        supportsVision: mods.includes('image') || undefined,
        supportsTools: params.includes('tools') || undefined,
        supportsThinking: params.includes('reasoning') || undefined,
      };
    });
  }

  readonly supportsTools = true;

  /** Our ChatMessage shape -> the OpenAI wire shape. */
  private wireMessages(messages: ChatMessage[]) {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      }
      if (m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((t) => ({
            id: t.id,
            type: 'function',
            function: { name: t.name, arguments: JSON.stringify(t.args) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  async *stream(opts: StreamOptions): AsyncGenerator<StreamDelta, StreamResult, void> {
    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      signal: opts.signal,
      body: JSON.stringify({
        model: opts.model,
        messages: this.wireMessages(opts.messages),
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        ...(opts.tools?.length ? { tools: opts.tools, tool_choice: 'auto' } : {}),
      }),
    });

    if (!res.ok) throw new ProviderUnavailable(this.id, await errorText(res));

    let tokens: number | undefined;
    let finishReason: string | undefined;

    /* Tool calls stream as fragments: the first frame carries id and name, then
       later frames append `arguments` a few characters at a time. They must be
       accumulated by index and only parsed once the stream ends. */
    const acc = new Map<number, { id: string; name: string; args: string }>();

    for await (const data of sseLines(res, opts.signal)) {
      if (data === '[DONE]') break;
      let j: any;
      try { j = JSON.parse(data); } catch { continue; }

      // Usage arrives on its own final frame when include_usage is set.
      if (j.usage?.completion_tokens) tokens = j.usage.completion_tokens;

      const choice = j.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;

      const d = choice?.delta;
      if (!d) continue;

      for (const tc of d.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const cur = acc.get(idx) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name = tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        acc.set(idx, cur);
      }

      // Some OpenRouter models expose chain-of-thought on a separate field.
      if (d.reasoning) yield { thinking: String(d.reasoning) };
      if (d.content) yield { text: String(d.content) };
    }

    const toolCalls: ToolCall[] = [...acc.values()]
      .filter((t) => t.name)
      .map((t) => {
        let args: Record<string, unknown> = {};
        try {
          args = t.args ? JSON.parse(t.args) : {};
        } catch {
          // A truncated or malformed argument blob must not crash the turn —
          // the loop reports it back to the model, which can retry.
          args = { __parseError: t.args };
        }
        return { id: t.id || crypto.randomUUID(), name: t.name, args };
      });

    return { tokens, finishReason, ...(toolCalls.length ? { toolCalls } : {}) };
  }
}

/* Ollama is NOT served from here. Its native /api/chat returns tool calls that
   this /v1 shim drops — see providers/ollama.ts for the measurement. */

/**
 * The system prompt.
 *
 * `toolNames` is passed rather than hardcoded so the prompt can never advertise
 * a capability the registry did not actually offer this turn.
 */
export function systemPrompt(
  toolNames: string[] = [],
  memories: string[] = [],
  /** The active project's instructions and knowledge, if any. */
  brief = '',
  /**
   * Which apps are connected right now.
   *
   * Their individual actions already ride in the request as schemas — this
   * only names the apps, so the model can answer "what can you do with my
   * Notion?" and can tell that `notion__search` and `github__create_issue`
   * belong to different systems rather than being a flat pile of verbs.
   */
  connectedApps = '',
): ChatMessage {
  const base =
    'You are Sakhi, an AI assistant that runs on the user\'s own computer. ' +
    'Be direct and concise. Use markdown when it aids readability — headings, ' +
    'lists, tables, fenced code.';

  /**
   * What is already known about this user.
   *
   * Storing memories was only ever half of remembering — nothing read them
   * back, so the assistant could save "prefers dark roast" and then answer
   * the next question as a total stranger. Injecting them here is what makes
   * the memory tool worth calling at all.
   */
  /* Placed ahead of the memories: a project's standing instructions set
     the frame that the recalled preferences then sit inside. */
  const project = brief ? `\n\n${brief}` : '';

  const apps = connectedApps ? `\n\n${connectedApps}` : '';

  const recall = memories.length
    ? '\n\nWhat you already know about this user (do not ask them again):\n' +
      memories.map((m) => `- ${m}`).join('\n')
    : '';

  /* Recording is behaviour the model has to be told to perform; left unsaid,
     it simply never calls the memory tool of its own accord. */
  const learn = toolNames.includes('memory')
    ? '\n\nLearning about the user:\n' +
      '- When they state a preference, a like, a dislike, a habit, how they ' +
      'want things done, or a durable fact about themselves or their work, ' +
      'call the memory tool with action "store" and the right kind ' +
      '(like, dislike, preference, project, fact).\n' +
      '- Do it silently while answering. Do not announce it, and do not ask ' +
      'permission to remember something they volunteered.\n' +
      '- Never store passwords, keys, or card numbers.\n' +
      '- Skip one-off task details. Only store what will still be true next week.'
    : '';

  /* No tools this turn — either the provider has none or this model cannot
     call them. Saying so explicitly is what stops the answer "Copied!" when
     nothing was copied: without this line, small models narrate the action
     they would have taken as though they had taken it. */
  if (!toolNames.length) {
    return {
      role: 'system',
      content:
        `${base}${project}${recall}\n\n` +
        'You have NO ability to act on this computer right now — no browser, ' +
        'no files, no clipboard, no applications. If the user asks you to DO ' +
        'something, say plainly that you cannot perform it and that a ' +
        'tool-capable model is needed. Never claim to have done it.',
    };
  }

  return {
    role: 'system',
    content:
      `${base}${project}${apps}${recall}${learn}\n\n` +
      `You are running on this ${process.platform} machine and can act on it.
` +
      /**
       * ── Why this block is short, and why it names no tools ──────────
       *
       * The previous version listed every tool by name in prose and stacked
       * six prohibitions ("Do not describe", "Do NOT use", "Never claim").
       * Measured against Gemini 2.5 Flash with the real tool schemas, that
       * block SUPPRESSED tool calling outright: identical request, tools
       * offered, and the model returned an empty turn with no function call.
       * Removing it restored the call immediately — the same empty-reply
       * symptom users were seeing.
       *
       * Two causes, both documented behaviour on current models. A prose tool
       * list shadows the real tool list the request already carries, and the
       * model reconciles the two instead of acting. And emphatic prohibitions
       * over-apply on models that follow instructions literally — a stack of
       * "do not" reads as "be cautious here", which is the opposite of what
       * was wanted.
       *
       * So: no tool inventory (the schemas are already in the request), and
       * the routing facts stated positively. Each line that remains says
       * something the model could not otherwise know.
       */
      'When asked to do something on this computer, use the tool that does it — ' +
      'consent is collected automatically before anything runs, so act rather ' +
      'than asking first.\n' +
      'Use one tool at a time and read its result before the next.\n' +
      'To play a song, track, album or video, use the browser tool with action ' +
      '"play_youtube" and the name as `query` — that searches and starts ' +
      'playback, where opening a search page would not.\n' +
      'For other web work — reading a page, filling a form, clicking through a ' +
      'site — drive the browser rather than handing over a link.\n' +
      'Tool results are JSON with a "success" field. When it is false, read the ' +
      '"error" and any "available" list, then retry with a corrected argument ' +
      'or say plainly what could not be done.\n' +
      'Afterwards, say in a sentence or two what actually happened, based on ' +
      'the results you got back.',
  };
}
