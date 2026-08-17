import type { ConnectionConfig } from './types.js';

/**
 * One-click app connectors.
 *
 * Every entry here was checked against the live npm registry (or the live
 * endpoint) on 2026-08-16 — the deprecated `@modelcontextprotocol/server-*`
 * packages for GitHub, Slack, Postgres, Puppeteer and Brave are deliberately
 * absent. Those moved to vendor-run remote servers, which is why the remote
 * entries below point at the vendor's own URL rather than an npm package.
 *
 * This catalogue is a convenience, not a limit: `transport: 'http'` or
 * `'stdio'` with a custom command connects to any MCP server that exists,
 * including ones written after this file.
 */

export interface CatalogEntry {
  id: string;
  label: string;
  /** One line, shown on the card. */
  blurb: string;
  /** Rendered as a grouping in the UI. */
  category: 'Files & Data' | 'Developer' | 'Productivity' | 'Web' | 'Utility';
  template: Omit<ConnectionConfig, 'id' | 'label' | 'enabled'>;
  /**
   * Credentials the connector needs. Stored encrypted, injected as env vars
   * (stdio) or as an Authorization bearer (http) at connect time.
   */
  secrets?: { name: string; label: string; help?: string }[];
  /**
   * Free-text settings baked into args at connect time — a folder to expose,
   * a database URL. `{{name}}` in an arg is replaced by the value.
   */
  inputs?: { name: string; label: string; placeholder?: string; help?: string }[];
  /** Shown when the connector needs something installed or authorised first. */
  setupNote?: string;
}

export const CATALOG: CatalogEntry[] = [
  {
    id: 'filesystem',
    label: 'Local Folder',
    blurb: 'Give Sakhi read and write access to one specific folder.',
    category: 'Files & Data',
    template: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '{{folder}}'],
    },
    inputs: [
      {
        name: 'folder',
        label: 'Folder to expose',
        placeholder: 'C:\\Users\\you\\Documents\\work',
        help: 'The connector can only ever see inside this folder.',
      },
    ],
  },
  {
    id: 'github',
    label: 'GitHub',
    blurb: 'Issues, pull requests, code search and repository files.',
    category: 'Developer',
    template: {
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      authSecret: 'GITHUB_MCP_TOKEN',
    },
    secrets: [
      {
        name: 'GITHUB_MCP_TOKEN',
        label: 'GitHub personal access token',
        help: 'github.com → Settings → Developer settings → Personal access tokens. Give it only the scopes you want Sakhi to have.',
      },
    ],
  },
  {
    id: 'notion',
    label: 'Notion',
    blurb: 'Search, read and update pages and databases.',
    category: 'Productivity',
    template: {
      transport: 'http',
      url: 'https://mcp.notion.com/mcp',
      authSecret: 'NOTION_MCP_TOKEN',
    },
    secrets: [
      {
        name: 'NOTION_MCP_TOKEN',
        label: 'Notion integration token',
        help: 'notion.so/my-integrations → new internal integration, then share the pages you want with it.',
      },
    ],
  },
  {
    id: 'sentry',
    label: 'Sentry',
    blurb: 'Look up issues, stack traces and releases.',
    category: 'Developer',
    template: {
      transport: 'http',
      url: 'https://mcp.sentry.dev/mcp',
      authSecret: 'SENTRY_MCP_TOKEN',
    },
    secrets: [{ name: 'SENTRY_MCP_TOKEN', label: 'Sentry auth token' }],
  },
  {
    id: 'memory',
    label: 'Knowledge Graph',
    blurb: 'A persistent graph of people, places and facts across chats.',
    category: 'Utility',
    template: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  },
  {
    id: 'sequential-thinking',
    label: 'Sequential Thinking',
    blurb: 'Lets the model work a hard problem through in explicit steps.',
    category: 'Utility',
    template: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
  },
  {
    id: 'everything',
    label: 'Test Connector',
    blurb: 'The reference server. Connect it to prove the pipeline works.',
    category: 'Utility',
    template: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    },
    setupNote:
      'Exposes deliberately simple tools (echo, add, long-running progress). ' +
      'Useful for checking that connecting, discovery and permission prompts all behave.',
  },
];

export function catalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.id === id);
}
