import fs from 'node:fs';
import path from 'node:path';
import { Connection } from './connection.js';
import { catalogEntry } from './catalog.js';
import { deleteSecrets, hasSecret, maskSecret } from '../security/keystore.js';
import { tools } from '../tools/registry.js';
import { hub } from '../events/emitter.js';
import type { ConnectionConfig, ConnectionStatus } from './types.js';

/**
 * The set of apps Sakhi is connected to.
 *
 * Connecting an app is two steps that have to stay together: open the
 * transport and ask what it can do, then publish those actions to the tool
 * registry so the model can actually use them. Disconnecting has to undo the
 * second step as reliably as the first, or the model keeps being offered tools
 * that route to a dead process.
 */

const FILE = path.join(process.cwd(), '.data', 'connections.json');

/**
 * Tools a connector marks read-only skip the consent prompt; everything else
 * gets one. The asymmetry is deliberate: reading a GitHub issue is not the
 * same act as closing one, and prompting for both trains people to click
 * Allow without looking.
 */
function needsPermission(readOnly: boolean, destructive: boolean): boolean {
  if (readOnly) return false;
  return destructive;
}

class ConnectionManager {
  private connections = new Map<string, Connection>();
  private loaded = false;

  /* ── Persistence ─────────────────────────────────────────────────
     Only the shape of a connection is written here. Credentials are
     referenced by name and live in the encrypted vault, so this file is safe
     to read, diff, and back up. */

  private load(): ConnectionConfig[] {
    try {
      if (!fs.existsSync(FILE)) return [];
      const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[mcp] connections file unreadable:', (e as Error).message);
      return [];
    }
  }

  private save() {
    const dir = path.dirname(FILE);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const configs = [...this.connections.values()].map((c) => c.config);
    fs.writeFileSync(FILE, JSON.stringify(configs, null, 2), { mode: 0o600 });
  }

  /** Reads the saved connections and connects the enabled ones. */
  async init() {
    if (this.loaded) return;
    this.loaded = true;

    for (const cfg of this.load()) {
      this.connections.set(cfg.id, new Connection(cfg));
    }

    /* In parallel and never rethrowing: one broken connector — an uninstalled
       package, an expired token — must not stop the others or the server. */
    await Promise.all(
      [...this.connections.values()]
        .filter((c) => c.config.enabled)
        .map((c) =>
          this.connect(c.id).catch((e) =>
            console.warn(`[mcp] ${c.id} failed to connect: ${(e as Error).message}`)
          )
        )
    );
  }

  list(): ConnectionStatus[] {
    return [...this.connections.values()].map((c) => this.status(c));
  }

  private status(c: Connection): ConnectionStatus {
    const entry = c.config.catalogId ? catalogEntry(c.config.catalogId) : undefined;
    const names = new Set<string>();
    if (c.config.authSecret) names.add(c.config.authSecret);
    for (const s of Object.values(c.config.env ?? {})) names.add(s);
    for (const s of entry?.secrets ?? []) names.add(s.name);

    return {
      id: c.config.id,
      label: c.config.label,
      transport: c.config.transport,
      enabled: c.config.enabled,
      state: c.state,
      serverName: c.serverName,
      serverVersion: c.serverVersion,
      tools: c.tools,
      resourceCount: c.resourceCount,
      promptCount: c.promptCount,
      error: c.error,
      connectedAt: c.connectedAt,
      catalogId: c.config.catalogId,
      credentials: [...names].map((n) => ({
        name: n,
        configured: hasSecret(n),
        masked: maskSecret(n),
      })),
    };
  }

  get(id: string): Connection | undefined {
    return this.connections.get(id);
  }

  async add(config: ConnectionConfig): Promise<ConnectionStatus> {
    if (this.connections.has(config.id)) {
      throw new Error(`A connection called "${config.id}" already exists.`);
    }
    const conn = new Connection(config);
    this.connections.set(config.id, conn);
    this.save();

    if (config.enabled) {
      /* Swallowed on purpose: a connector that fails to start is a state to
         show on its card, not a reason to refuse to save it. The user needs
         the row visible so they can fix the token and retry. */
      await this.connect(config.id).catch(() => {});
    }
    return this.status(conn);
  }

  async remove(id: string): Promise<void> {
    const conn = this.connections.get(id);
    if (!conn) return;

    await this.disconnect(id);

    /* The tokens go with it. Leaving a live GitHub PAT in the vault for a
       connection the user just deleted is the kind of thing nobody expects
       and nobody checks. */
    const secretNames = [
      ...(conn.config.authSecret ? [conn.config.authSecret] : []),
      ...Object.values(conn.config.env ?? {}),
    ];
    if (secretNames.length) deleteSecrets(secretNames);

    this.connections.delete(id);
    this.save();
  }

  async connect(id: string): Promise<ConnectionStatus> {
    const conn = this.connections.get(id);
    if (!conn) throw new Error(`No connection called "${id}".`);

    hub.emit('notification', { level: 'info', message: `Connecting to ${conn.config.label}…` });

    try {
      await conn.connect();
    } catch (e) {
      hub.emit('notification', {
        level: 'error',
        message: `${conn.config.label} did not connect: ${(e as Error).message}`,
      });
      throw e;
    }

    this.publishTools(conn);

    conn.config.enabled = true;
    this.save();

    hub.emit('notification', {
      level: 'info',
      message:
        `${conn.config.label} connected — ${conn.tools.length} action` +
        `${conn.tools.length === 1 ? '' : 's'} available.`,
    });

    return this.status(conn);
  }

  /**
   * Publishes an app's discovered actions as ordinary tools.
   *
   * This is the join between the two halves. After this call the model sees
   * the app's actions in exactly the same list as `browser` and `files`, and
   * they execute through the same gated path — the registry does not know or
   * care that these came from another process.
   */
  private publishTools(conn: Connection) {
    for (const t of conn.tools) {
      tools.register({
        name: t.qualifiedName,
        title: `${conn.config.label}: ${t.name}`,
        description: t.description,
        requiresPermission: needsPermission(t.readOnly, t.destructive),
        schema: t.inputSchema,
        source: { kind: 'connection', connectionId: conn.id },
        run: (args, ctx) => {
          ctx.progress(30, `${conn.config.label}…`);
          return conn.call(t.name, (args ?? {}) as Record<string, unknown>, ctx.signal);
        },
      });
    }
  }

  async disconnect(id: string): Promise<ConnectionStatus> {
    const conn = this.connections.get(id);
    if (!conn) throw new Error(`No connection called "${id}".`);

    /* Withdrawn before the transport closes, so there is no window where the
       model can be handed a tool whose process is already going away. */
    tools.unregisterFrom(id);
    await conn.disconnect();

    conn.config.enabled = false;
    this.save();
    return this.status(conn);
  }

  /** Drops and re-reads an app's catalogue — for when its tools have changed. */
  async refresh(id: string): Promise<ConnectionStatus> {
    await this.disconnect(id);
    return this.connect(id);
  }

  /**
   * A one-line summary of what is connected, for the system prompt.
   *
   * The model already receives every action as a schema; this exists so it
   * knows the apps exist as *apps* — which is what lets it answer "what can
   * you do with my GitHub?" without guessing.
   */
  summary(): string {
    const live = [...this.connections.values()].filter((c) => c.state === 'connected' && c.tools.length);
    if (!live.length) return '';
    return (
      'Apps connected to this computer, and how many actions each exposes:\n' +
      live
        .map((c) => `- ${c.config.label} (${c.tools.length} actions, prefix \`${c.id}__\`)`)
        .join('\n') +
      '\nTheir actions are in your tool list like any other. Use them when the ' +
      'user refers to that app by name.'
    );
  }

  async shutdown() {
    await Promise.all([...this.connections.keys()].map((id) => this.disconnect(id).catch(() => {})));
  }
}

export const connections = new ConnectionManager();
