/**
 * App connections, over the Model Context Protocol.
 *
 * The shape of the idea: a connector describes itself. On connect we ask the
 * server what it can do (`tools/list`) and get back a name, a description and
 * a JSON Schema for every action the app supports. That description IS how
 * Sakhi "learns the app" — nothing about GitHub or Notion is hardcoded here,
 * and a connector released next year works without a code change.
 *
 * Those discovered actions are then registered as ordinary tools, so they run
 * through exactly the same permission gate and event timeline as the built-in
 * ones.
 */

export type Transport = 'stdio' | 'http';

export interface ConnectionConfig {
  /** Slug. Namespaces the tools this connection contributes. */
  id: string;
  label: string;
  transport: Transport;

  /* stdio */
  command?: string;
  args?: string[];
  /** Names of stored secrets to inject as env vars, keyed by env var name. */
  env?: Record<string, string>;

  /* http */
  url?: string;
  /** Name of the stored secret sent as `Authorization: Bearer …`. */
  authSecret?: string;
  headers?: Record<string, string>;

  /** A disabled connection is remembered but not connected at startup. */
  enabled: boolean;

  /** Which catalogue entry this came from, when it came from one. */
  catalogId?: string;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/** One action a connected app exposes. */
export interface DiscoveredTool {
  /** The app's own name for it, e.g. `create_issue`. */
  name: string;
  /** The namespaced name the model sees, e.g. `github__create_issue`. */
  qualifiedName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** From the MCP annotations, when the server provides them. */
  readOnly: boolean;
  destructive: boolean;
}

export interface ConnectionStatus {
  id: string;
  label: string;
  transport: Transport;
  enabled: boolean;
  state: ConnectionState;
  /** Populated once connected. */
  serverName?: string;
  serverVersion?: string;
  tools: DiscoveredTool[];
  resourceCount: number;
  promptCount: number;
  error?: string;
  connectedAt?: number;
  catalogId?: string;
  /** Secret names this connection needs, with whether each is set. */
  credentials: { name: string; configured: boolean; masked: string | null }[];
}
