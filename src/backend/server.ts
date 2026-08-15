import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

import { ProviderManager } from './services/ProviderManager';
import { ToolRegistry } from './services/ToolRegistry';
import { Planner } from './planner/Planner';

const providerManager = new ProviderManager();
const toolRegistry = new ToolRegistry();
const planner = new Planner(providerManager, toolRegistry);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

// Get current model & mode
app.get('/api/model', (req, res) => {
  res.json({
    provider: providerManager.getProvider(),
    mode: providerManager.getMode(),
  });
});

// Get local device models
app.get('/api/models/local', async (req, res) => {
  try {
    const localModels: string[] = ['Llama 3.2 3B (Local)', 'Qwen 2.5 Coder 7B (Local)', 'Mistral 7B (Local)', 'Phi-3 Mini (Local)'];
    
    // Attempt to query live local Ollama instance if active
    try {
      const ollamaRes = await fetch('http://127.0.0.1:11434/api/tags');
      if (ollamaRes.ok) {
        const data: any = await ollamaRes.json();
        if (data && data.models) {
          data.models.forEach((m: any) => {
            const name = `${m.name} (Ollama Local)`;
            if (!localModels.includes(name)) localModels.unshift(name);
          });
        }
      }
    } catch (e) {}

    // Attempt to query live local LM Studio instance if active
    try {
      const lmRes = await fetch('http://127.0.0.1:1234/v1/models');
      if (lmRes.ok) {
        const data: any = await lmRes.json();
        if (data && data.data) {
          data.data.forEach((m: any) => {
            const name = `${m.id} (LM Studio Local)`;
            if (!localModels.includes(name)) localModels.unshift(name);
          });
        }
      }
    } catch (e) {}

    res.json({ localModels });
  } catch (err: any) {
    res.json({ localModels: ['Llama 3.2 3B (Local)', 'Qwen 2.5 Coder 7B (Local)'] });
  }
});

// Save API Keys
app.post('/api/settings/apikeys', (req, res) => {
  const { geminiKey, claudeKey, openaiKey, openrouterKey } = req.body;
  if (geminiKey) process.env.GEMINI_API_KEY = geminiKey;
  if (claudeKey) process.env.ANTHROPIC_API_KEY = claudeKey;
  if (openaiKey) process.env.OPENAI_API_KEY = openaiKey;
  if (openrouterKey) process.env.OPENROUTER_API_KEY = openrouterKey;

  logger.info('Updated LLM Provider API Keys');
  res.json({ status: 'success', message: 'API keys updated successfully' });
});

// Update model & mode
app.post('/api/model', (req, res) => {
  const { provider, mode } = req.body;
  if (provider) providerManager.setProvider(provider);
  if (mode) providerManager.setMode(mode);
  res.json({
    provider: providerManager.getProvider(),
    mode: providerManager.getMode(),
  });
});

// Chat endpoint routed to LangGraph Planner
app.post('/api/chat', async (req, res) => {
  try {
    const { message, model, mode, apiKeys } = req.body;
    if (model) providerManager.setProvider(model);
    if (mode) providerManager.setMode(mode);

    if (apiKeys) {
      if (apiKeys.geminiKey && apiKeys.geminiKey.trim()) process.env.GEMINI_API_KEY = apiKeys.geminiKey.trim();
      if (apiKeys.claudeKey && apiKeys.claudeKey.trim()) process.env.ANTHROPIC_API_KEY = apiKeys.claudeKey.trim();
      if (apiKeys.openaiKey && apiKeys.openaiKey.trim()) process.env.OPENAI_API_KEY = apiKeys.openaiKey.trim();
      if (apiKeys.openrouterKey && apiKeys.openrouterKey.trim()) process.env.OPENROUTER_API_KEY = apiKeys.openrouterKey.trim();
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    logger.info(`Received chat request: "${message}"`);
    const output = await planner.executePlan(message);

    res.json({
      sender: 'assistant',
      text: output,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  } catch (err: any) {
    logger.error('Error handling chat request', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  logger.info('New WebSocket connection established');
  
  ws.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'chat') {
        if (parsed.model) providerManager.setProvider(parsed.model);
        if (parsed.mode) providerManager.setMode(parsed.mode);
        const output = await planner.executePlan(parsed.message);
        ws.send(JSON.stringify({
          type: 'chat_response',
          sender: 'assistant',
          text: output,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
      }
    } catch (e: any) {
      logger.error('WebSocket message parsing error', { error: e.message });
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket connection closed');
  });
});

const PORT = process.env.PORT || 3001;

import { initDatabase } from './services/Database';

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    logger.warn(`Port ${PORT} is already in use by a running backend process. Reusing active backend instance.`);
  } else {
    logger.error('Server error', { error: err.message });
  }
});

wss.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    logger.warn(`WebSocket port ${PORT} is already bound.`);
  } else {
    logger.error('WebSocket server error', { error: err.message });
  }
});

initDatabase().then(() => {
  try {
    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  } catch (e: any) {
    logger.warn(`Server listen exception: ${e.message}`);
  }
});
