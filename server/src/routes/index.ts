import os from 'node:os';
import express, { Router, type Request, type Response } from 'express';
import { speak, ttsReady, voices, warmTts } from '../audio/tts.js';
import { sttReady, transcribe, warmStt, type SttEngine } from '../audio/stt.js';
import { hub } from '../events/emitter.js';
import { orchestrator } from '../orchestrator/orchestrator.js';
import { plan } from '../planner/planner.js';
import { providers } from '../providers/manager.js';
import { tools } from '../tools/registry.js';
import { answerPermission, isAutoApprove, listPending } from '../tools/permissions.js';
import { db } from '../db/client.js';
import { listKeyStatus, setKey } from '../security/keystore.js';
import { ProviderUnavailable, type ProviderId } from '../providers/types.js';

export const api = Router();

/* ─── HEALTH ──────────────────────────────────────────────────────── */

api.get('/health', async (_req, res) => {
  const database = await db.health();
  res.json({
    ok: true,
    uptime: process.uptime(),
    clients: hub.clientCount,
    activeRequests: orchestrator.list().length,
    database,
  });
});

/* ─── EVENT STREAM (SSE) ──────────────────────────────────────────── */

api.get('/events', (req: Request, res: Response) => {
  const id = hub.addSse(res);

  /* Catch-up policy, most specific first:
       ?replay=0     nothing — live events only, for a client that keeps its
                     own transcript and must not have an old turn replayed in
       ?since=<seq>  everything after that sequence number
       (neither)     only a turn that is STILL RUNNING

     The last case used to replay the entire buffer, which handed a brand-new
     listener the whole previous conversation — including a "working" state
     whose completion event had already been and gone. */
  if (req.query.replay === '0') return;

  const since = Number(req.query.since);
  if (Number.isFinite(since) && since > 0) {
    hub.replayTo(id, since);
    return;
  }

  hub.replayActiveTurn(id);
});

/* ─── CHAT ────────────────────────────────────────────────────────── */

api.post('/chat', async (req, res) => {
  const { message, conversationId, provider, model, projectId } = req.body ?? {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'A non-empty "message" is required.' });
  }

  // Return the request id immediately so the client can cancel, then stream
  // everything else over the event channel. The HTTP response is not the
  // transport for content — the event stream is.
  let handleId: string | null = null;

  const done = orchestrator.run(
    async (h) => {
      handleId = h.id;
      h.emit('conversation.started', {
        conversationId: conversationId ?? h.id,
        provider: provider ?? 'auto',
        model: model ?? 'auto',
      });
      return plan(h, { message, conversationId, provider, model, projectId });
    },
    {
      onFinish: async (h) => {
        if (h.state === 'cancelled') {
          hub.emit('notification', { level: 'info', message: 'Request cancelled.' });
        }
        // response.completed is emitted here, not in the planner, so it fires
        // on every exit path including failure — the frontend always leaves
        // its "active" state and the logo always stops.
        hub.emit('response.completed', {
          duration: Number(((h.durationMs ?? 0) / 1000).toFixed(2)),
        });
      },
    }
  );

  // Give the orchestrator a tick to assign the id before replying.
  await new Promise((r) => setImmediate(r));
  res.status(202).json({ requestId: handleId, accepted: true });

  const { handle, error } = await done;
  if (error) {
    hub.emit('notification', {
      level: 'error',
      message:
        error instanceof ProviderUnavailable
          ? error.message
          : `Request failed: ${error.message}`,
    });
    await db.logAgent(null, 'planner', undefined, undefined, handle.durationMs, error.message);
  }
});

api.post('/chat/cancel', (req, res) => {
  const { requestId } = req.body ?? {};
  const cancelled = requestId ? orchestrator.cancel(requestId) : orchestrator.cancelAll() > 0;
  res.json({ cancelled });
});

/* ─── PERMISSIONS ─────────────────────────────────────────────────── */

/**
 * Answers a `permission.required` event. The id is the trailing token of that
 * event's `reason` field. Until this arrives the agentic loop is genuinely
 * blocked — there is no timeout that grants by default.
 */
api.post('/chat/permission', (req, res) => {
  const { id, granted, remember } = req.body ?? {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'An "id" string is required.' });
  const ok = answerPermission(id, Boolean(granted), Boolean(remember));
  // Announced so every connected client clears the prompt, not just the one
  // that answered it.
  if (ok) hub.emit('permission.resolved', { id, granted: Boolean(granted) });
  res.status(ok ? 200 : 404).json({ ok, pending: listPending() });
});

api.get('/chat/permission', (_req, res) => {
  res.json({ pending: listPending(), autoApprove: isAutoApprove() });
});

/* ─── PROVIDERS + MODELS ──────────────────────────────────────────── */

api.get('/providers', async (_req, res) => {
  res.json({ providers: await providers.available(), keys: listKeyStatus() });
});

api.get('/providers/:id/models', async (req, res) => {
  try {
    const models = await providers.listModels(req.params.id as ProviderId);
    res.json({ models });
  } catch (e) {
    const err = e as Error;
    res.status(err instanceof ProviderUnavailable ? 400 : 500).json({ error: err.message });
  }
});

/* Fire-and-forget warm-up. Answers immediately and lets the load run in the
   background: the caller only needs to know the request was accepted, and
   holding the socket open for a multi-minute model load helps nobody. */
api.post('/providers/:id/preload', (req, res) => {
  const id = req.params.id as ProviderId;
  const { model } = req.body ?? {};
  if (typeof model !== 'string' || !model) {
    return res.status(400).json({ error: 'A "model" string is required.' });
  }

  void providers.preload(id, model);
  res.json({ ok: true, warming: model });
});

api.post('/providers/:id/key', async (req, res) => {
  const id = req.params.id as ProviderId;
  const { key } = req.body ?? {};
  if (typeof key !== 'string') return res.status(400).json({ error: 'A "key" string is required.' });

  setKey(id, key);
  // Prove the key works before reporting success — a stored-but-dead key is
  // worse than a rejected one.
  try {
    const models = await providers.listModels(id);
    res.json({ ok: true, models: models.length, keys: listKeyStatus() });
  } catch (e) {
    res.status(400).json({ ok: false, error: (e as Error).message, keys: listKeyStatus() });
  }
});

/* ─── SPEECH ──────────────────────────────────────────────────────── */

/**
 * Audio crosses this boundary as raw 16 kHz mono float PCM, not as a
 * container. The browser already has the samples in that form from the Web
 * Audio graph, so shipping them straight through means neither side needs an
 * encoder or a codec — and no webm/opus decoding in Node, which is the part
 * that would otherwise drag in ffmpeg.
 */
api.post(
  '/stt',
  express.raw({ type: 'application/octet-stream', limit: '25mb' }),
  async (req, res) => {
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 4) {
      return res.status(400).json({ error: 'Send 16kHz mono float32 PCM as the raw body.' });
    }

    // Float32Array must be 4-byte aligned; Buffer pooling does not guarantee
    // that, so copy when the offset is not.
    const aligned =
      body.byteOffset % 4 === 0
        ? new Float32Array(body.buffer, body.byteOffset, Math.floor(body.length / 4))
        : new Float32Array(new Uint8Array(body).buffer);

    const engine: SttEngine = req.query.engine === 'parakeet' ? 'parakeet' : 'moonshine';

    try {
      const out = await transcribe(aligned, engine);
      res.json(out);
    } catch (e) {
      res.status(503).json({ error: (e as Error).message });
    }
  }
);

api.post('/tts', async (req, res) => {
  const { text, voice, speed } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'A "text" string is required.' });
  }

  try {
    const wav = await speak(text, { voice, speed });
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(wav.length));
    res.send(wav);
  } catch (e) {
    res.status(503).json({ error: (e as Error).message });
  }
});

api.get('/speech/status', async (_req, res) => {
  res.json({
    tts: { engine: 'kokoro-82m', loaded: ttsReady(), voices: await voices() },
    stt: {
      offline: { engine: 'moonshine', loaded: sttReady() },
      online: { engine: 'parakeet-tdt-0.6b', configured: Boolean(process.env.NVIDIA_API_KEY) },
    },
  });
});

/* Same fire-and-forget shape as the model preload: answer at once, load in
   the background. The first request otherwise pays for the weight download. */
api.post('/speech/preload', (_req, res) => {
  void warmTts();
  void warmStt();
  res.json({ ok: true, warming: ['kokoro', 'moonshine'] });
});

/* ─── SYSTEM METRICS ──────────────────────────────────────────────── */

/**
 * Real CPU and memory, measured here because the renderer cannot see them:
 * the Electron window runs with nodeIntegration off and no preload bridge.
 *
 * The settings panel previously displayed `cpu: 24, mem: 42, gpu: 'NVIDIA
 * RTX 4090 (12%)'` — hardcoded literals under a heading that said "Live
 * system telemetry". Numbers presented as measurements have to be measured.
 */
let cpuMark = os.cpus();

function cpuPercent(): number {
  const now = os.cpus();
  // First call after boot has no previous sample to difference against.
  if (now.length !== cpuMark.length) {
    cpuMark = now;
    return 0;
  }

  let idle = 0;
  let total = 0;
  for (let i = 0; i < now.length; i++) {
    const a = cpuMark[i].times;
    const b = now[i].times;
    const dIdle = b.idle - a.idle;
    const dTotal =
      b.user - a.user + b.nice - a.nice + b.sys - a.sys + b.irq - a.irq + dIdle;
    idle += dIdle;
    total += dTotal;
  }
  cpuMark = now;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)));
}

api.get('/system', (_req, res) => {
  const total = os.totalmem();
  const used = total - os.freemem();

  res.json({
    cpu: cpuPercent(),
    mem: Math.round((used / total) * 100),
    memUsedGb: +(used / 1024 ** 3).toFixed(1),
    memTotalGb: +(total / 1024 ** 3).toFixed(1),
    /* GPU load needs a vendor tool (nvidia-smi, rocm-smi) that may not be
       installed. Reporting the CPU model we can actually see beats inventing
       a graphics card we cannot. */
    gpu: null,
    cores: os.cpus().length,
    cpuModel: os.cpus()[0]?.model?.trim() ?? 'Unknown CPU',
    platform: `${os.type()} ${os.release()}`,
    uptimeSec: Math.round(os.uptime()),
  });
});

/* ─── PROJECTS ────────────────────────────────────────────────────── */

/**
 * A project is a workspace with its own memory.
 *
 * Deleting one cascades to its memories (see schema.prisma) — that is the
 * point: a project the user is finished with should not keep colouring later
 * answers with preferences that only applied to it.
 */
api.get('/projects', async (_req, res) => {
  try {
    const rows = await db.raw.project.findMany({
      where: { archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { memories: true } } },
    });
    res.json({
      projects: rows.map((p: any) => ({
        id: p.id, name: p.name, description: p.description, rootPath: p.rootPath,
        instructions: p.instructions,
        memoryCount: p._count.memories, updatedAt: p.updatedAt,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

api.post('/projects', async (req, res) => {
  const { name, description, rootPath } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'A project "name" is required.' });
  }
  try {
    const row = await db.raw.project.create({
      data: { name: name.trim(), description: description ?? null, rootPath: rootPath ?? null },
    });
    res.json({ project: row });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

api.post('/projects/:id', async (req, res) => {
  const { name, description, rootPath, instructions } = req.body ?? {};
  try {
    const row = await db.raw.project.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(rootPath !== undefined ? { rootPath } : {}),
        ...(instructions !== undefined ? { instructions } : {}),
      },
    });
    res.json({ project: row });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

api.delete('/projects/:id', async (req, res) => {
  try {
    await db.raw.project.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

/* ─── PROJECT KNOWLEDGE ───────────────────────────────────────────
   Reference material the agent treats as known context for this project —
   the equivalent of Claude Projects' project knowledge. */

api.get('/projects/:id/knowledge', async (req, res) => {
  try {
    const docs = await db.raw.projectKnowledge.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ knowledge: docs });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

api.post('/projects/:id/knowledge', async (req, res) => {
  const { title, content } = req.body ?? {};
  if (typeof title !== 'string' || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'A "title" and non-empty "content" are required.' });
  }
  try {
    const doc = await db.raw.projectKnowledge.create({
      data: { projectId: req.params.id, title: title.trim() || 'Untitled', content },
    });
    res.json({ document: doc });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

api.delete('/projects/:id/knowledge/:docId', async (req, res) => {
  try {
    await db.raw.projectKnowledge.delete({ where: { id: req.params.docId } });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

/** What Sakhi knows within one project — its memory, listed for review. */
api.get('/projects/:id/memories', async (req, res) => {
  try {
    const rows = await db.raw.memory.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ memories: rows });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/* ─── TOOLS ───────────────────────────────────────────────────────── */

api.get('/tools', (_req, res) => res.json({ tools: tools.list() }));

/* ─── CONVERSATIONS ───────────────────────────────────────────────── */

api.get('/conversations', async (_req, res) => {
  res.json({ conversations: await db.listConversations() });
});

api.get('/conversations/:id/messages', async (req, res) => {
  res.json({ messages: await db.recentMessages(req.params.id, 100) });
});
