import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport as SdkTransport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { getSecret } from '../security/keystore.js';
import type {
  ConnectionConfig, ConnectionState, DiscoveredTool,
} from './types.js';

/**
 * A single live connection to one app.
 *
 * Owns the transport, the handshake, and the catalogue of what the app can do.
 * It deliberately knows nothing about the tool registry or about events —
 * `manager.ts` wires it to those — so the protocol work stays testable and the
 * failure modes stay local.
 */

/** Tool names must satisfy `^[a-zA-Z0-9_-]{1,64}$` for the OpenAI tools API. */
function qualify(connectionId: string, toolName: string): string {
  const raw = `${connectionId}__${toolName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (raw.length <= 64) return raw;
  /* Truncating alone can collide — two long names sharing a prefix would map
     to the same tool. Keep a short hash of the full name on the end so the
     result stays unique and stable. */
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  const suffix = `_${(h >>> 0).toString(36)}`;
  return raw.slice(0, 64 - suffix.length) + suffix;
}

/** How long to wait on the handshake before calling it dead. */
const CONNECT_TIMEOUT_MS = 60_000;

export class Connection {
  state: ConnectionState = 'disconnected';
  error?: string;
  tools: DiscoveredTool[] = [];
  resourceCount = 0;
  promptCount = 0;
  serverName?: string;
  serverVersion?: string;
  connectedAt?: number;

  private client?: Client;

  constructor(public config: ConnectionConfig) {}

  get id() {
    return this.config.id;
  }

  /** Maps a namespaced tool back to the app's own name for it. */
  originalName(qualifiedName: string): string | undefined {
    return this.tools.find((t) => t.qualifiedName === qualifiedName)?.name;
  }

  private buildTransport(): SdkTransport {
    const c = this.config;

    if (c.transport === 'http') {
      if (!c.url) throw new Error('This connection has no URL.');
      const headers: Record<string, string> = { ...c.headers };
      if (c.authSecret) {
        const token = getSecret(c.authSecret);
        if (!token) {
          throw new Error(
            `Missing credential "${c.authSecret}". Add it in Connections before connecting.`
          );
        }
        headers.Authorization = `Bearer ${token}`;
      }
      return new StreamableHTTPClientTransport(new URL(c.url), {
        requestInit: { headers },
      });
    }

    if (!c.command) throw new Error('This connection has no command to run.');

    /* Only the variables the connector was configured with are passed through,
       plus the minimum a child process needs to run at all. Handing a
       third-party connector the whole environment would give it every other
       app's token as well. */
    const env: Record<string, string> = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
      const v = process.env[key];
      if (v) env[key] = v;
    }
    for (const [envVar, secretName] of Object.entries(c.env ?? {})) {
      const val = getSecret(secretName);
      if (!val) {
        throw new Error(
          `Missing credential "${secretName}". Add it in Connections before connecting.`
        );
      }
      env[envVar] = val;
    }

    return new StdioClientTransport({
      command: c.command,
      args: c.args ?? [],
      env,
      /* Inherited stderr would interleave a connector's chatter into Sakhi's
         own logs with no way to tell whose it was. */
      stderr: 'pipe',
    });
  }

  /**
   * Connects and asks the app to describe itself.
   *
   * The `tools/list` result is the whole point: it is a machine-readable
   * account of everything the app can do, which becomes the model's
   * understanding of it.
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return;

    this.state = 'connecting';
    this.error = undefined;

    try {
      const transport = this.buildTransport();
      const client = new Client(
        { name: 'sakhi', version: '1.0.0' },
        { capabilities: {} }
      );

      await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
      this.client = client;

      const info = client.getServerVersion();
      this.serverName = info?.name;
      this.serverVersion = info?.version;

      const caps = client.getServerCapabilities();

      /* Only ask for what the server said it has. Calling tools/list on a
         server without the tools capability is a protocol error, not an
         empty list. */
      this.tools = caps?.tools ? await this.discoverTools(client) : [];

      /* Counted for display only — knowing an app also exposes 40 documents
         is useful context, but reading them is a separate, explicit act. */
      this.resourceCount = caps?.resources ? await this.countResources(client) : 0;
      this.promptCount = caps?.prompts ? await this.countPrompts(client) : 0;

      this.state = 'connected';
      this.connectedAt = Date.now();
    } catch (e) {
      this.state = 'error';
      this.error = (e as Error).message;
      await this.disconnect();
      throw e;
    }
  }

  private async discoverTools(client: Client): Promise<DiscoveredTool[]> {
    const out: DiscoveredTool[] = [];
    let cursor: string | undefined;

    /* Paginated: a large connector can expose well over a hundred actions and
       returns them a page at a time. Reading only the first page would silently
       hide the rest. */
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      for (const t of page.tools ?? []) {
        const ann = (t.annotations ?? {}) as {
          readOnlyHint?: boolean;
          destructiveHint?: boolean;
        };
        out.push({
          name: t.name,
          qualifiedName: qualify(this.config.id, t.name),
          description: t.description ?? `${t.name} (from ${this.config.label})`,
          inputSchema: (t.inputSchema as Record<string, unknown>) ?? {
            type: 'object',
            properties: {},
          },
          readOnly: ann.readOnlyHint === true,
          /* Absent annotations mean unknown, and unknown is treated as
             destructive. A connector that neglects to say gets the prompt. */
          destructive: ann.destructiveHint !== false,
        });
      }
      cursor = page.nextCursor;
    } while (cursor);

    return out;
  }

  private async countResources(client: Client): Promise<number> {
    try {
      const r = await client.listResources();
      return r.resources?.length ?? 0;
    } catch {
      return 0;
    }
  }

  private async countPrompts(client: Client): Promise<number> {
    try {
      const r = await client.listPrompts();
      return r.prompts?.length ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Runs one of the app's actions.
   *
   * MCP returns content blocks rather than a string; they are flattened to
   * text because that is what the tool-result channel carries. `isError` is
   * surfaced in the same `success:false` shape the built-in tools use, so the
   * model handles a connector failure with no special casing.
   */
  async call(
    toolName: string,
    args: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<string> {
    if (!this.client || this.state !== 'connected') {
      return JSON.stringify({
        success: false,
        error: `${this.config.label} is not connected.`,
      });
    }

    const res = await this.client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { signal, timeout: 120_000 }
    );

    const blocks = (res.content ?? []) as { type: string; text?: string; [k: string]: unknown }[];
    const text = blocks
      .map((b) => {
        if (b.type === 'text') return b.text ?? '';
        /* Images and audio cannot ride the tool-result channel, which is
           text. Naming the block is more use to the model than dropping it. */
        if (b.type === 'resource') return `[resource: ${JSON.stringify(b.resource ?? {}).slice(0, 500)}]`;
        return `[${b.type} content omitted]`;
      })
      .filter(Boolean)
      .join('\n');

    if (res.isError) {
      return JSON.stringify({
        success: false,
        error: text || 'The app reported an error but gave no detail.',
      });
    }

    /* structuredContent is the typed result when a server declares an output
       schema; it is strictly better for the model than the text rendering. */
    if (res.structuredContent) {
      return JSON.stringify({ success: true, result: res.structuredContent });
    }

    return JSON.stringify({ success: true, result: text || 'Done.' });
  }

  async disconnect(): Promise<void> {
    const c = this.client;
    this.client = undefined;
    this.tools = [];
    this.resourceCount = 0;
    this.promptCount = 0;
    this.connectedAt = undefined;
    if (this.state !== 'error') this.state = 'disconnected';
    try {
      await c?.close();
    } catch {
      /* Already gone — a failed close must not mask the reason we are here. */
    }
  }
}
