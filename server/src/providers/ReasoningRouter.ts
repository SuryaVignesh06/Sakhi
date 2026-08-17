import { determineMode } from '../mode/connectivity.js';
import { providers } from './manager.js';

export type ReasoningTask = "relevance_check" | "link_follow_decision" | "sufficiency_check" | "synthesis" | "intent_check";

export interface ReasoningRequest {
  task: ReasoningTask;
  prompt: string;
  context?: string;
}

export interface ReasoningResponse {
  provider: 'gemini' | 'openrouter' | 'local';
  model_name: string;
  content: string;
  latency_ms: number;
}

export async function executeReasoningTask(request: ReasoningRequest): Promise<ReasoningResponse> {
  const modeStatus = await determineMode();
  if (modeStatus.mode === 'offline') {
    throw new Error(`Cannot execute online reasoning task in offline mode: ${modeStatus.reason}`);
  }

  const startTime = Date.now();
  try {
    // Attempt Gemini First
    const geminiProvider = await providers.get('gemini');
    if (!geminiProvider) throw new Error('Gemini provider not configured');

    const modelName = request.task === 'synthesis' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    
    const messages = [];
    if (request.context) {
      messages.push({ role: 'system', content: request.context });
    }
    messages.push({ role: 'user', content: request.prompt });

    const stream = geminiProvider.stream({
      model: modelName,
      messages: messages as any,
      temperature: 0.2
    });
    let responseText = '';
    for await (const chunk of stream) {
      if (chunk.text) responseText += chunk.text;
    }

    return {
      provider: 'gemini',
      model_name: modelName,
      content: responseText,
      latency_ms: Date.now() - startTime
    };

  } catch (geminiError) {
    console.warn('Gemini reasoning failed, falling back to OpenRouter...', geminiError);
    // Fallback to OpenRouter
    const orProvider = await providers.get('openrouter');
    if (!orProvider) throw new Error('OpenRouter provider not configured for fallback');

    const modelName = request.task === 'synthesis' ? 'anthropic/claude-3-5-sonnet' : 'meta-llama/llama-3-8b-instruct';
    
    const messages = [];
    if (request.context) {
      messages.push({ role: 'system', content: request.context });
    }
    messages.push({ role: 'user', content: request.prompt });

    const stream = orProvider.stream({
      model: modelName,
      messages: messages as any,
      temperature: 0.2
    });
    let responseText = '';
    for await (const chunk of stream) {
      if (chunk.text) responseText += chunk.text;
    }

    return {
      provider: 'openrouter',
      model_name: modelName,
      content: responseText,
      latency_ms: Date.now() - startTime
    };
  }
}
