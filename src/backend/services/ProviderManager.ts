import { logger } from '../utils/logger';

export interface ProviderResponse {
  content: string;
  toolCalls?: any[];
}

export const EVA_SYSTEM_PROMPT = `# Eva System Prompt

You are Eva, a privacy-first desktop AI operating assistant.
Your primary objective is to help the user think, plan, automate, create, and solve problems accurately while maintaining security, clarity, and efficiency.

## Core Principles
- Prioritize correctness over confidence.
- Never invent facts, files, actions, or results.
- Keep responses helpful, clear, and direct.`;

export class ProviderManager {
  private activeProvider: string = 'Gemini 2.5 Pro';
  private mode: 'online' | 'offline' = 'online';

  constructor() {
    logger.info('ProviderManager initialized with Eva System Prompt');
  }

  setProvider(provider: string) {
    this.activeProvider = provider;
    logger.info(`Active provider set to: ${this.activeProvider}`);
  }

  setMode(mode: 'online' | 'offline') {
    this.mode = mode;
    logger.info(`Mode set to: ${this.mode}`);
  }

  getMode() {
    return this.mode;
  }

  getProvider() {
    return this.activeProvider;
  }

  async generate(prompt: string, context: any = {}): Promise<ProviderResponse> {
    logger.info(`Generating response using [${this.mode.toUpperCase()}] provider: ${this.activeProvider}`);

    const isLocal =
      this.mode === 'offline' ||
      /local|ollama|lmstudio|llama|qwen|mistral|phi/i.test(this.activeProvider);

    if (isLocal) {
      let modelTag = this.activeProvider
        .replace(/\s*\(.*?\)\s*/g, '')
        .trim();

      if (!modelTag || /local/i.test(modelTag)) {
        if (/llama/i.test(this.activeProvider)) modelTag = 'llama3.2:3b';
        else if (/qwen/i.test(this.activeProvider)) modelTag = 'qwen2.5-coder:7b';
        else if (/mistral/i.test(this.activeProvider)) modelTag = 'mistral';
        else if (/phi/i.test(this.activeProvider)) modelTag = 'phi3';
        else modelTag = 'llama3.2';
      }

      // 1. Try Ollama on 11434
      try {
        const ollamaRes = await fetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelTag.toLowerCase(),
            prompt: `${EVA_SYSTEM_PROMPT}\n\nUser Question: ${prompt}`,
            stream: false,
          }),
        });
        if (ollamaRes.ok) {
          const data: any = await ollamaRes.json();
          if (data && data.response) {
            return { content: data.response };
          }
        }
      } catch (e) {}

      // 2. Try LM Studio on 1234 (OpenAI compatible)
      try {
        const lmRes = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelTag,
            messages: [
              { role: 'system', content: EVA_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          }),
        });
        if (lmRes.ok) {
          const data: any = await lmRes.json();
          const text = data?.choices?.[0]?.message?.content;
          if (text) return { content: text };
        }
      } catch (e) {}

      if (this.mode === 'offline' || /local/i.test(this.activeProvider)) {
        return {
          content: `Local LLM Server (Ollama on :11434 / LM Studio on :1234) is unreachable or model "${modelTag}" is not loaded. Please start Ollama or LM Studio locally to generate responses with local models!`,
        };
      }
    }

    // ONLINE MODE: Check API Keys in environment / context
    const geminiKey = (process.env.GEMINI_API_KEY || context?.apiKeys?.geminiKey || '').trim();
    const openrouterKey = (process.env.OPENROUTER_API_KEY || context?.apiKeys?.openrouterKey || '').trim();
    const openaiKey = (process.env.OPENAI_API_KEY || context?.apiKeys?.openaiKey || '').trim();
    const claudeKey = (process.env.ANTHROPIC_API_KEY || context?.apiKeys?.claudeKey || '').trim();

    // 1. Try Gemini API
    if (geminiKey) {
      const geminiModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash'];
      for (const mName of geminiModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${mName}:generateContent?key=${geminiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: `${EVA_SYSTEM_PROMPT}\n\nUser Question: ${prompt}` }],
                },
              ],
            }),
          });

          if (res.ok) {
            const data: any = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return { content: text };
          }
        } catch (e: any) {
          logger.error(`Gemini API call failed for model ${mName}`, { error: e.message });
        }
      }
    }

    // 2. Try OpenRouter API
    if (openrouterKey) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openrouterKey}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash:free',
            messages: [
              { role: 'system', content: EVA_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (res.ok) {
          const data: any = await res.json();
          const text = data?.choices?.[0]?.message?.content;
          if (text) return { content: text };
        }
      } catch (e: any) {
        logger.error('OpenRouter API call failed', { error: e.message });
      }
    }

    // 3. Try OpenAI API
    if (openaiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: EVA_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (res.ok) {
          const data: any = await res.json();
          const text = data?.choices?.[0]?.message?.content;
          if (text) return { content: text };
        }
      } catch (e: any) {
        logger.error('OpenAI API call failed', { error: e.message });
      }
    }

    // 4. Try Anthropic Claude API
    if (claudeKey) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': claudeKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            system: EVA_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (res.ok) {
          const data: any = await res.json();
          const text = data?.content?.[0]?.text;
          if (text) return { content: text };
        }
      } catch (e: any) {
        logger.error('Anthropic API call failed', { error: e.message });
      }
    }

    // If no key set or API call failed
    return {
      content: `Please enter your API Key in **Settings (⚙️) → AI Models & API Keys** (e.g. Gemini, OpenRouter, or OpenAI key) to generate live AI chatbot responses!`,
    };
  }
}
