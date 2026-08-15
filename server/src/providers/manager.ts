import { GeminiProvider } from './gemini.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAICompatibleProvider } from './openaiCompatible.js';
import { OllamaProvider } from './ollama.js';
import { getKey } from '../security/keystore.js';
import { ProviderUnavailable, type ModelInfo, type Provider, type ProviderId } from './types.js';

/**
 * Owns every provider and answers one question for the rest of the system:
 * "which provider and model should run this request?"
 *
 * Nothing above this file mentions a vendor.
 */
class ProviderManager {
  private readonly providers = new Map<ProviderId, Provider>();

  constructor() {
    this.register(new GeminiProvider(() => getKey('gemini')));
    this.register(new AnthropicProvider(() => getKey('anthropic')));
    this.register(
      new OpenAICompatibleProvider('openai', 'OpenAI', {
        baseUrl: 'https://api.openai.com/v1',
        getKey: () => getKey('openai'),
      })
    );
    this.register(
      new OpenAICompatibleProvider('openrouter', 'OpenRouter', {
        baseUrl: 'https://openrouter.ai/api/v1',
        getKey: () => getKey('openrouter'),
        extraHeaders: {
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'Sakhi',
        },
      })
    );
    this.register(new OllamaProvider(process.env.OLLAMA_URL ?? 'http://localhost:11434'));
    this.register(
      new OpenAICompatibleProvider('lmstudio', 'LM Studio', {
        baseUrl: `${process.env.LMSTUDIO_URL ?? 'http://localhost:1234'}/v1`,
        isLocal: true,
      })
    );
  }

  private register(p: Provider) {
    this.providers.set(p.id, p);
  }

  get(id: ProviderId): Provider {
    const p = this.providers.get(id);
    if (!p) throw new ProviderUnavailable(id, `Unknown provider "${id}".`);
    return p;
  }

  all(): Provider[] {
    return [...this.providers.values()];
  }

  /** Which providers can actually run right now. Probed, not assumed. */
  async available(): Promise<{ id: ProviderId; label: string; isLocal: boolean; ready: boolean }[]> {
    return Promise.all(
      this.all().map(async (p) => ({
        id: p.id,
        label: p.label,
        isLocal: p.isLocal,
        ready: await p.isConfigured().catch(() => false),
      }))
    );
  }

  async listModels(id: ProviderId): Promise<ModelInfo[]> {
    return this.get(id).listModels();
  }

  /**
   * Warm a model so the first turn does not pay for the disk read.
   *
   * Returns false rather than throwing when the provider has no notion of
   * preloading — a cloud model needs no warming, and that is not an error.
   */
  async preload(id: ProviderId, model: string): Promise<boolean> {
    const p = this.get(id);
    if (!p.preload) return false;
    return p.preload(model).catch(() => false);
  }

  /**
   * Picks a provider when the caller did not name one.
   *
   * Order is deliberate: an explicit request wins; then the configured default;
   * then local runtimes, because they cost nothing and keep data on the machine;
   * then whichever cloud provider has a key.
   */
  async resolve(preferred?: { provider?: ProviderId; model?: string }): Promise<{ provider: Provider; model: string }> {
    if (preferred?.provider) {
      const p = this.get(preferred.provider);
      if (!(await p.isConfigured())) {
        throw new ProviderUnavailable(p.id, `${p.label} is not configured.`);
      }
      return { provider: p, model: preferred.model ?? (await this.firstModel(p)) };
    }

    const envProvider = process.env.DEFAULT_PROVIDER as ProviderId | undefined;
    if (envProvider && this.providers.has(envProvider)) {
      const p = this.get(envProvider);
      if (await p.isConfigured()) {
        // An explicitly requested model still wins here. Reading DEFAULT_MODEL
        // first made the model picker do nothing whenever DEFAULT_PROVIDER was
        // set, which is the normal configuration.
        return {
          provider: p,
          model: preferred?.model ?? process.env.DEFAULT_MODEL ?? (await this.firstModel(p)),
        };
      }
    }

    const ordered = [
      ...this.all().filter((p) => p.isLocal),
      ...this.all().filter((p) => !p.isLocal),
    ];
    for (const p of ordered) {
      if (await p.isConfigured().catch(() => false)) {
        const model = await this.firstModel(p).catch(() => null);
        if (model) return { provider: p, model };
      }
    }

    throw new ProviderUnavailable(
      'gemini',
      'No provider is configured. Add an API key, or start Ollama or LM Studio locally.'
    );
  }

  /**
   * The model to use when the caller did not name one.
   *
   * A tools-capable model is preferred over the merely-first one: this
   * assistant's job is to act on the machine, and a model that cannot call a
   * tool turns every automation request into an apology.
   */
  private async firstModel(p: Provider): Promise<string> {
    const models = await p.listModels();
    if (!models.length) throw new ProviderUnavailable(p.id, `${p.label} returned no models.`);

    /**
     * Prefer a model that is actually runnable here.
     *
     * Ollama's /api/tags lists `:cloud` tags alongside genuinely local ones,
     * and they look identical — same shape, `tools: true`, no marker saying
     * they are gated. Picking one is a silent failure: the turn gets a
     * 403 "requires a subscription" and ends with no reply, which is exactly
     * the empty-response symptom this defaulted into.
     *
     * A local tag is chosen first; a cloud tag only if nothing else can call
     * tools, so a subscriber is not blocked from theirs.
     */
    const runnable = models.filter((m) => !/[:@-]cloud/i.test(m.id));
    const pick =
      runnable.find((m) => m.supportsTools) ??
      models.find((m) => m.supportsTools) ??
      runnable[0] ??
      models[0];
    return pick.id;
  }
}

export const providers = new ProviderManager();
export type { ProviderId, ModelInfo };
