import type { RequestHandle } from '../orchestrator/orchestrator.js';
import type { ToolSchema } from '../providers/types.js';
import { DESKTOP_SCHEMA, runDesktop, type DesktopArgs } from './desktop.js';
import { BROWSER_SCHEMA, runBrowser, type BrowserArgs } from './browser.js';
import { CLIPBOARD_SCHEMA, runClipboard, type ClipboardArgs } from './clipboard.js';
import { FILES_SCHEMA, runFiles, type FilesArgs } from './files.js';
import { TERMINAL_SCHEMA, runTerminal, type TerminalArgs } from './terminal.js';
import { MEMORY_SCHEMA, runMemory, type MemoryArgs } from './memory.js';
import { RESEARCH_SCHEMA, runResearch, type ResearchArgs } from './research.js';
import { FS_SCHEMA, runFs, type FsArgs } from './filesystem.js';
import { APPS_SCHEMA, runApps, type AppsArgs } from './apps.js';
import { requestPermission } from './permissions.js';

/**
 * Tool registry — the one place a capability is declared and the one path it
 * runs through.
 *
 * Every tool reports through `ctx`, so tool.started / progress / completed /
 * failed are emitted consistently rather than by each tool remembering to.
 * All six execute.
 */

export type ToolName =
  | 'browser' | 'desktop' | 'terminal' | 'clipboard' | 'files' | 'memory'
  | 'research' | 'filesystem' | 'apps';

export interface ToolContext {
  /** Emits tool.progress for this tool. */
  progress(percent: number, message?: string): void;
  /** Aborts when the user cancels the request. */
  signal: AbortSignal;
}

export interface ToolDefinition<A = unknown, R = unknown> {
  name: ToolName;
  title: string;
  description: string;
  /** True when the tool changes machine state and needs explicit consent. */
  requiresPermission: boolean;
  /** JSON Schema for arguments, for future model tool-calling. */
  schema: Record<string, unknown>;
  run(args: A, ctx: ToolContext): Promise<R>;
}

export class ToolNotImplemented extends Error {
  constructor(name: ToolName) {
    super(`The ${name} tool is registered but not implemented yet.`);
    this.name = 'ToolNotImplemented';
  }
}

/* Placeholder bodies are tracked by identity so `implemented` is a fact about
   the function, not a guess from reading its source. */
const PLACEHOLDERS = new Set<ToolDefinition['run']>();

/* Nothing uses this today — every tool executes — but the machinery stays so a
   new capability can be declared before it is built, and `implemented` keeps
   telling the truth about it. */
export const notYet = (name: ToolName): ToolDefinition['run'] => {
  const fn = async () => {
    throw new ToolNotImplemented(name);
  };
  PLACEHOLDERS.add(fn);
  return fn;
};

const BUILTIN: ToolDefinition[] = [
  {
    name: 'browser',
    title: 'Browser',
    description:
      'Drive a real browser the user can watch: open pages, type, click, and play videos. ' +
      'Use action "play_youtube" with the song name whenever the user asks to PLAY music ' +
      'or a video — it searches and starts playback, rather than only opening a page.',
    requiresPermission: true,
    schema: BROWSER_SCHEMA as unknown as Record<string, unknown>,
    run: (args, ctx) => runBrowser(args as BrowserArgs, ctx),
  },
  {
    name: 'desktop',
    title: 'Desktop Control',
    description:
      'Launch an application on the user\'s computer. Use action "list_apps" first ' +
      'if unsure what is available.',
    requiresPermission: true,
    schema: DESKTOP_SCHEMA as unknown as Record<string, unknown>,
    // The first tool with a real body. See tools/desktop.ts for why it uses
    // execFile with an allow-list rather than a shell string.
    run: (args, ctx) => runDesktop(args as DesktopArgs, ctx),
  },
  {
    name: 'terminal',
    title: 'System Check',
    description:
      'Run a read-only system check: date, whoami, hostname, disk_usage, memory_usage, ' +
      'running_apps, battery, ip_address, workspace_size.',
    // Every action is on a read-only allow-list and changes nothing, so a
    // prompt here bought no safety and cost a great deal: answering "hi" with
    // the date called this tool, and the turn stopped dead on a consent card.
    // Prompts that fire on harmless things train people to click Allow blind.
    requiresPermission: false,
    schema: TERMINAL_SCHEMA as unknown as Record<string, unknown>,
    run: (args, ctx) => runTerminal(args as TerminalArgs, ctx),
  },
  {
    name: 'clipboard',
    title: 'Clipboard',
    description: 'Read the system clipboard, or copy text onto it.',
    // Same reasoning: no persistent change to the machine.
    requiresPermission: false,
    schema: CLIPBOARD_SCHEMA as unknown as Record<string, unknown>,
    run: (args, ctx) => runClipboard(args as ClipboardArgs, ctx),
  },
  {
    name: 'files',
    title: 'Files',
    description:
      'Read, write, append to and list files inside the user\'s Sakhi workspace folder.',
    requiresPermission: true,
    schema: FILES_SCHEMA as unknown as Record<string, unknown>,
    run: (args, ctx) => runFiles(args as FilesArgs, ctx),
  },
  {
    name: 'filesystem',
    title: 'File Manager',
    description:
      'Read, write, organise, search, move, copy and delete the files a person owns, anywhere in ' +
      'their home folder. Use this for real file management — tidying folders, finding documents ' +
      'by name or contents, renaming in bulk. The separate "files" tool is only for the small ' +
      'Sakhi workspace; prefer this one whenever the user means their actual files.',
    // Destructive actions are recoverable (deletes go to the Recycle Bin) and
    // system directories are refused outright, so the gate would fire on
    // routine work without preventing anything a prompt could not undo.
    requiresPermission: true,
    schema: FS_SCHEMA as unknown as Record<string, unknown>,
    run: (args, ctx) => runFs(args as FsArgs, ctx),
  },
  {
    name: 'apps',
    title: 'Installed Apps',
    description:
      'See which developer apps are installed and drive them: open a folder in VS Code, open a ' +
      'repository in GitHub Desktop, or run a read-only git command such as status, log or diff.',
    requiresPermission: false,
    schema: APPS_SCHEMA as unknown as Record<string, unknown>,
    run: (args, ctx) => runApps(args as AppsArgs, ctx),
  },
  {
    name: 'research',
    title: 'Web Research',
    description:
      'Search the web and read pages. Use action "deep" to research a question end to end — ' +
      'it searches, opens the best results, and returns their text. Use "search" for just links, ' +
      'and "read" to pull one known URL. Reach for this whenever the answer depends on current ' +
      'information, on something after your training cutoff, or on the contents of a given site.',
    // Reads public pages and changes nothing on the machine, so gating it
    // would only train the user to click through prompts.
    requiresPermission: false,
    schema: RESEARCH_SCHEMA as unknown as Record<string, unknown>,
    run: (args, ctx) => runResearch(args as ResearchArgs, ctx),
  },
  {
    name: 'memory',
    title: 'Memory',
    description: 'Store a fact about the user for later, or search what has been stored.',
    // Reading and writing the assistant's own notes changes nothing on the
    // machine, so gating it would train the user to click through prompts.
    requiresPermission: false,
    schema: MEMORY_SCHEMA as unknown as Record<string, unknown>,
    run: (args, ctx) => runMemory(args as MemoryArgs, ctx),
  },
];

class ToolRegistry {
  private tools = new Map<ToolName, ToolDefinition>();

  constructor() {
    for (const t of BUILTIN) this.tools.set(t.name, t);
  }

  /** Replaces a placeholder with a real implementation. */
  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: ToolName): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** A tool is implemented when its `run` is not one of the placeholders. */
  private isImplemented(t: ToolDefinition): boolean {
    return !PLACEHOLDERS.has(t.run as ToolDefinition['run']);
  }

  list(): { name: ToolName; title: string; description: string; requiresPermission: boolean; implemented: boolean }[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      requiresPermission: t.requiresPermission,
      implemented: this.isImplemented(t),
    }));
  }

  /**
   * Schemas handed to the model.
   *
   * Only implemented tools are offered. Advertising a tool that throws
   * `ToolNotImplemented` would make the model plan around a capability that
   * cannot run, then fail — worse than not having it.
   */
  schemas(): ToolSchema[] {
    return [...this.tools.values()]
      .filter((t) => this.isImplemented(t))
      .map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.schema,
        },
      }));
  }

  /**
   * Runs a tool with full event reporting and permission gating. This is the
   * only path a tool is ever invoked through, so the frontend timeline can
   * never have a gap and a gated tool can never slip past the prompt.
   */
  async invoke(name: ToolName, args: unknown, h: RequestHandle): Promise<string> {
    const tool = this.get(name);
    if (!tool) {
      // Handed back rather than thrown: a model that invented a tool name
      // should get a correctable answer, not a dead turn.
      return JSON.stringify({
        success: false,
        error: `Unknown tool "${name}".`,
        available: this.schemas().map((s) => s.function.name),
      });
    }

    const started = Date.now();
    h.emit('tool.started', { tool: name, title: tool.title });

    if (tool.requiresPermission) {
      const summary =
        typeof args === 'object' && args
          ? Object.entries(args as Record<string, unknown>)
              .map(([k, v]) => `${k}=${String(v)}`)
              .join(' ')
          : '';
      h.emit('tool.progress', { tool: name, progress: 0, message: 'Waiting for permission…' });

      const decision = await requestPermission(name, `${tool.title}: ${summary}`.trim(), h.signal);
      if (!decision.granted) {
        const why = decision.reason === 'cancelled' ? 'Request was cancelled.' : 'User denied permission.';
        h.emit('tool.failed', { tool: name, error: why });

        /* Stated by the backend, not left to the model.
           A denied model has been observed replying "copied successfully"
           anyway. The receipt already shows the tool as failed; this makes the
           contradiction explicit in words the model cannot overwrite. */
        h.emit('notification', {
          level: 'warn',
          message: `${tool.title} was not allowed to run, so nothing was changed on your computer.`,
        });

        // Returned, not thrown: the model should see the refusal and respond
        // to the user about it rather than the turn dying.
        return JSON.stringify({
          success: false,
          denied: true,
          error: why,
          instruction:
            'This action did NOT happen. Tell the user plainly that it was declined ' +
            'and that nothing was changed. Do not claim it succeeded.',
        });
      }
    }

    const ctx: ToolContext = {
      progress: (percent, message) =>
        h.emit('tool.progress', { tool: name, progress: Math.round(percent), message }),
      signal: h.signal,
    };

    try {
      const result = await tool.run(args, ctx);
      h.emit('tool.completed', { tool: name, duration: Date.now() - started, status: 'success' });
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (e) {
      const msg = (e as Error).message;
      h.emit('tool.failed', { tool: name, error: msg });
      // Same reasoning as a denial — hand the failure back to the model.
      return JSON.stringify({ success: false, error: msg });
    }
  }
}

export const tools = new ToolRegistry();
