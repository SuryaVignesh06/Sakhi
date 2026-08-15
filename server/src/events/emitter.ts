import type { WebSocket } from 'ws';
import type { ServerResponse } from 'http';
import { makeEvent, type AppEvent, type EventType, type PayloadOf } from './protocol.js';

/**
 * The event hub. Every visual the frontend shows originates here.
 *
 * Two properties matter and are enforced structurally:
 *
 *  1. Ordering. Events are assigned a monotonic sequence number and written
 *     synchronously in emit order. A `response.chunk` can never overtake the
 *     `planner.stage` that preceded it.
 *
 *  2. Replay. A short ring buffer is kept per connection-less client so a
 *     browser that reconnects mid-turn does not lose the stages it missed.
 *     Without this a refresh during a long tool run leaves a blank timeline.
 */

type Client =
  | { kind: 'ws'; id: string; socket: WebSocket }
  | { kind: 'sse'; id: string; res: ServerResponse };

const REPLAY_LIMIT = 200;

class EventHub {
  private clients = new Map<string, Client>();
  private buffer: { seq: number; event: AppEvent }[] = [];
  private seq = 0;

  addWebSocket(socket: WebSocket): string {
    const id = crypto.randomUUID();
    this.clients.set(id, { kind: 'ws', id, socket });
    socket.on('close', () => this.clients.delete(id));
    socket.on('error', () => this.clients.delete(id));
    return id;
  }

  addSse(res: ServerResponse): string {
    const id = crypto.randomUUID();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx and friends buffer SSE by default, which defeats streaming.
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    this.clients.set(id, { kind: 'sse', id, res });
    res.on('close', () => this.clients.delete(id));
    return id;
  }

  /** Sends the recent buffer to one client — used on (re)connect. */
  replayTo(id: string, sinceSeq = 0) {
    const c = this.clients.get(id);
    if (!c) return;
    for (const { seq, event } of this.buffer) {
      if (seq > sinceSeq) this.write(c, event);
    }
  }

  /**
   * Replays only the turn that is still running, if there is one.
   *
   * A client that reconnects mid-turn needs the events it missed. A client
   * that simply loaded the page must NOT be handed the last finished turn —
   * replaying the whole buffer made every page load re-render an old
   * conversation, complete with a stale "working" indicator that nothing would
   * ever clear.
   *
   * @returns how many events were replayed.
   */
  replayActiveTurn(id: string): number {
    const c = this.clients.get(id);
    if (!c) return 0;

    // Find where the most recent turn began.
    let start = -1;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].event.type === 'conversation.started') {
        start = i;
        break;
      }
    }
    if (start < 0) return 0;

    // If that turn already ended, there is nothing in flight to catch up on.
    for (let i = start; i < this.buffer.length; i++) {
      if (this.buffer[i].event.type === 'response.completed') return 0;
    }

    for (let i = start; i < this.buffer.length; i++) this.write(c, this.buffer[i].event);
    return this.buffer.length - start;
  }

  emit<T extends EventType>(type: T, payload: PayloadOf<T>): AppEvent {
    const event = makeEvent(type, payload);
    this.seq += 1;
    this.buffer.push({ seq: this.seq, event });
    if (this.buffer.length > REPLAY_LIMIT) this.buffer.shift();

    for (const c of this.clients.values()) this.write(c, event);
    return event;
  }

  private write(c: Client, event: AppEvent) {
    const line = JSON.stringify(event);
    try {
      if (c.kind === 'ws') {
        // 1 === OPEN. Writing to a closing socket throws.
        if (c.socket.readyState === 1) c.socket.send(line);
      } else {
        c.res.write(`data: ${line}\n\n`);
      }
    } catch {
      this.clients.delete(c.id);
    }
  }

  get clientCount() {
    return this.clients.size;
  }

  /** Keeps proxies from closing an idle SSE connection. */
  startHeartbeat(ms = 25_000) {
    const t = setInterval(() => {
      for (const c of this.clients.values()) {
        if (c.kind === 'sse') {
          try { c.res.write(': ping\n\n'); } catch { this.clients.delete(c.id); }
        } else if (c.socket.readyState === 1) {
          try { c.socket.ping(); } catch { this.clients.delete(c.id); }
        }
      }
    }, ms);
    t.unref?.();
    return () => clearInterval(t);
  }
}

export const hub = new EventHub();
