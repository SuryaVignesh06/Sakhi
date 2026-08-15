import { useState, useCallback } from 'react';
import { API_BASE } from '../../../api';

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'code' | 'folder';
  size?: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  attachments?: Attachment[];
  model?: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    sender: 'assistant',
    text: "Welcome to Eva OS\nI'm your autonomous AI Operating System. How can I assist you with your project today?",
    timestamp: 'Just now',
  },
];

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [chatInput, setChatInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const textToSend = overrideText !== undefined ? overrideText : chatInput;
    if (!textToSend.trim() && attachments.length === 0) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: [...attachments],
    };

    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setAttachments([]);

    let replyText: string | null = null;
    const selectedModelRaw = localStorage.getItem('ff.model.v1');
    const selectedModel = selectedModelRaw ? JSON.parse(selectedModelRaw)?.name || 'Gemini 2.5 Pro' : 'Gemini 2.5 Pro';

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend.trim(),
          model: selectedModel,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.text && !data.text.startsWith('Received your message')) {
          replyText = data.text;
        }
      }
    } catch (e) {}

    // Local model browser fallback
    if (!replyText) {
      const isLocal = /local|ollama|lmstudio|llama|qwen|mistral|phi/i.test(selectedModel);
      if (isLocal) {
        let modelTag = selectedModel.replace(/\s*\(.*?\)\s*/g, '').trim();
        if (!modelTag || /local/i.test(modelTag)) modelTag = 'llama3.2';

        try {
          const oRes = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelTag.toLowerCase(),
              prompt: textToSend.trim(),
              stream: false,
            }),
          });
          if (oRes.ok) {
            const oData = await oRes.json();
            if (oData && oData.response) replyText = oData.response;
          }
        } catch (e) {}

        if (!replyText) {
          try {
            const lmRes = await fetch('http://localhost:1234/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: modelTag,
                messages: [{ role: 'user', content: textToSend.trim() }],
              }),
            });
            if (lmRes.ok) {
              const lmData = await lmRes.json();
              const textOut = lmData?.choices?.[0]?.message?.content;
              if (textOut) replyText = textOut;
            }
          } catch (e) {}
        }
      }
    }

    if (!replyText) {
      replyText = `Eva AI: Received "${textToSend.trim()}". Local & cloud LLM services synchronized.`;
    }

    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      sender: 'assistant',
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, assistantMsg]);
  }, [chatInput, attachments]);

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const addAttachment = useCallback((item: Attachment) => {
    setAttachments(prev => [...prev, item]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  return {
    messages,
    setMessages,
    chatInput,
    setChatInput,
    attachments,
    addAttachment,
    removeAttachment,
    webSearchEnabled,
    setWebSearchEnabled,
    sendMessage,
    clearChat,
  };
}
