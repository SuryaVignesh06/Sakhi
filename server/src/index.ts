import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { api } from './routes/index.js';
import { hub } from './events/emitter.js';
import { db } from './db/client.js';
import { closeBrowser } from './tools/browser.js';
import { orchestrator } from './orchestrator/orchestrator.js';

const PORT = Number(process.env.PORT ?? 3007);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.use('/api', api);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[http] unhandled:', err.message);
  res.status(500).json({ error: err.message });
});

const server = http.createServer(app);

/* WebSocket is the preferred transport; /api/events (SSE) is the fallback the
   frontend uses when a socket cannot be opened. Both feed the same hub, so the
   event ordering guarantee holds regardless of which one a client picked. */
const wss = new WebSocketServer({ server, path: '/events' });
wss.on('connection', (socket) => {
  const id = hub.addWebSocket(socket);
  hub.replayTo(id, 0);
});

const stopHeartbeat = hub.startHeartbeat();

server.listen(PORT, () => {
  console.log(`Sakhi backend :${PORT}`);
  console.log(`  events  ws://localhost:${PORT}/events`);
  console.log(`  events  http://localhost:${PORT}/api/events  (SSE)`);
  console.log(`  health  http://localhost:${PORT}/api/health`);
});

/* Shut down cleanly: cancel in-flight work so upstream fetches abort rather
   than being left dangling, then close the DB. */
async function shutdown(signal: string) {
  console.log(`\n[${signal}] shutting downâ€¦`);
  stopHeartbeat();
  const cancelled = orchestrator.cancelAll();
  if (cancelled) console.log(`  cancelled ${cancelled} in-flight request(s)`);
  wss.close();
  server.close();
  // A headed Chromium outlives its parent otherwise, leaving a window the user
  // has to close by hand after the server is gone.
  await closeBrowser();
  await db.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
