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
import {
  verifyLaunch, verifyClipboard, verifyFiles, verifyFilesystem, verifyBrowser,
  LAUNCH_RECOVERY, BROWSER_RECOVERY, WRITE_RECOVERY, CLIPBOARD_RECOVERY,
} from './verify.js';

/**
 * Tool registry — the one place a capability is declared and the one path it
 * runs through.
 *
 * Every tool reports through `ctx`, so tool.started / progress / completed /
 * failed are emitted consistently rather than by each tool remembering to.
 * All six execute.
 */

export type BuiltinToolName =
  | 'browser' | 'desktop' | 'terminal' | 'clipboard' | 'files' | 'memory'
  | 'research' | 'filesystem' | 'apps';

/**
 * Built-in names still autocomplete, but the type admits any string because
 * connected apps contribute tools whose names are not known until runtime.
 * `& {}` is what stops TypeScript collapsing the union down to plain `string`
 * and losing those suggestions.
 */
export type ToolName = BuiltinToolName | (string & {});

/** Where a tool came from — used to withdraw an app's tools when it leaves. */
export type ToolSource =
  | { kind: 'builtin' }
  | { kind: 'connection'; connectionId: string };

export interface ToolContext {
  /** Emits tool.progress for this tool. */
  progress(percent: number, message?: string): void;
  /** Aborts when the user cancels the request. */
  signal: AbortSignal;
}

/**
 * The result of going and looking at the world.
 *
 * `evidence` is what was actually observed, and it is handed to the model
 * whether the check passed or failed — "chrome.exe is running" is a far better
 * thing for the next turn to reason over than a bare `success: true`.
 */
export interface Verification {
  verified: boolean;
  /** What was observed. Always populated. */
  evidence: string;
  /** Why it failed. Only when `verified` is false. */
  reason?: string;
}

/** One fallback strategy, tried after verification fails. */
export interface Recovery<A = unknown> {
  /** Named in the transcript, so a recovery is never silent. */
  label: string;
  run(args: A, ctx: ToolContext): Promise<unknown>;
}

export interface ToolDefinition<A = unknown, R = unknown> {
  name: ToolName;
  title: string;
  description: string;
  /** True when the tool changes machine state and needs explicit consent. */
  requiresPermission: boolean;
  /** JSON Schema for arguments, for future model tool-calling. */
  schema: Record<string, unknown>;
  /** Defaults to builtin when a tool does not say. */
  source?: ToolSource;
  run(args: A, ctx: ToolContext): Promise<R>;
  /**
   * Observes the world to confirm the action actually happened.
   *
   * Must not read the tool's own success claim — that is the entire point.
   * A tool with no verifier is trusted, which is the old behaviour and is
   * still correct for anything that only reads.
   */
  verify?(args: A, result: R, ctx: ToolContext): Promise<Verification>;
  /** Tried in order when `verify` fails. */
  recoveries?: Recovery<A>[];
}

/** Tool results are usually JSON strings; merging needs the object back. */
function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { message: s };
  }
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
    verify: (args, result, ctx) => verifyBrowser(args as never, result, ctx),
    recoveries: BROWSER_RECOVERY,
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
    /* `start chrome` returns 0 immediately whether or not Chrome appears, so
       this is the tool the whole verification layer was built for. */
    verify: (args, result, ctx) => verifyLaunch(args as never, result, ctx),
    recoveries: LAUNCH_RECOVERY,
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
    /* Reading it straight back is the cheapest honest check here, and it
       answers the exact failure the tool comments describe: a model
       announcing "Copied!" when nothing was copied. */
    verify: (args, result, ctx) => verifyClipboard(args as never, result, ctx),
    recoveries: CLIPBOARD_RECOVERY,
  },
  {
    name: 'files',
    title: 'Files',
    description:
      'Read, write, append to and list files inside the user\'s Sakhi workspace folder.',
    requiresPermission: true,
    schema: FILES_SCHEMA as unknown as Record<string, unknown>,
    run: (args, ctx) => runFiles(args as FilesArgs, ctx),
    verify: (args, result, ctx) => verifyFiles(args as never, result, ctx),
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
    /* A move is verified at the destination, never the source: checking the
       source would pass for a move that silently did nothing. */
    verify: (args, result, ctx) => verifyFilesystem(args as never, result, ctx),
    recoveries: WRITE_RECOVERY,
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

  /** Replaces a placeholder, or adds a tool contributed by a connected app. */
  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  /**
   * Withdraws every tool a connection contributed.
   *
   * Called before its transport closes. A tool left behind would still be
   * offered to the model, which would call it and get a "not connected"
   * failure it had no way to anticipate.
   */
  unregisterFrom(connectionId: string): number {
    let n = 0;
    for (const [name, t] of this.tools) {
      if (t.source?.kind === 'connection' && t.source.connectionId === connectionId) {
        this.tools.delete(name);
        n++;
      }
    }
    return n;
  }

  get(name: ToolName): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** A tool is implemented when its `run` is not one of the placeholders. */
  private isImplemented(t: ToolDefinition): boolean {
    return !PLACEHOLDERS.has(t.run as ToolDefinition['run']);
  }

  list(): {
    name: ToolName; title: string; description: string;
    requiresPermission: boolean; implemented: boolean; source: ToolSource;
  }[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      requiresPermission: t.requiresPermission,
      implemented: this.isImplemented(t),
      source: t.source ?? { kind: 'builtin' as const },
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
      /* Phrased as a question, because it is one, and the answer can now be
         spoken or typed as well as clicked. `action=launch_app app_name=chrome`
         was accurate and unreadable — a consent prompt nobody parses is a
         consent prompt nobody is really giving. */
      const summary =
        typeof args === 'object' && args
          ? Object.entries(args as Record<string, unknown>)
              .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
              .map(([k, v]) => `${k.replace(/_/g, ' ')} ${String(v)}`)
              .join(', ')
          : '';
      const ask = summary
        ? `${tool.title} — ${summary}. Shall I go ahead?`
        : `${tool.title}. Shall I go ahead?`;

      h.emit('tool.progress', { tool: name, progress: 0, message: 'Waiting for your go-ahead…' });

      const decision = await requestPermission(name, ask, h.signal);
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
      let result = await tool.run(args, ctx);

      /* ── Observe → Verify → Recover ──────────────────────────────
         Without this, "the launcher exited 0" and "the app is running" are
         the same sentence to the model, and it will confidently report the
         second having only established the first. */
      if (tool.verify) {
        ctx.progress(85, 'Checking it actually worked…');
        let check = await this.observe(tool, args, result, ctx);

        for (const recovery of tool.recoveries ?? []) {
          if (check.verified || h.signal.aborted) break;

          h.emit('tool.progress', {
            tool: name,
            progress: 90,
            message: `Didn't work — trying: ${recovery.label}`,
          });
          /* Stated out loud. A recovery the user cannot see is
             indistinguishable from the tool having worked first time, and
             they are entitled to know their machine was poked twice. */
          h.emit('notification', {
            level: 'info',
            message: `${tool.title} did not take effect, retrying: ${recovery.label}.`,
          });

          try {
            result = (await recovery.run(args, ctx)) as typeof result;
          } catch (e) {
            h.emit('tool.progress', {
              tool: name, progress: 92,
              message: `That attempt failed too: ${(e as Error).message}`,
            });
            continue;
          }
          check = await this.observe(tool, args, result, ctx);
        }

        if (!check.verified) {
          /* Reported as a failure even though `run` resolved. This is the
             whole feature: the tool's own report is not the last word, and
             the model must not be able to describe this as done. */
          h.emit('tool.failed', { tool: name, error: check.reason ?? 'Could not be verified.' });
          return JSON.stringify({
            success: false,
            verified: false,
            error: check.reason ?? 'The action could not be verified.',
            observed: check.evidence,
            instruction:
              'This action did NOT verifiably happen. Do not tell the user it succeeded. ' +
              'Say what was observed, and either try a different approach or ask them to check.',
          });
        }

        h.emit('tool.completed', {
          tool: name, duration: Date.now() - started, status: 'success',
        });
        const payload = typeof result === 'string' ? safeParse(result) : result;
        return JSON.stringify({
          ...(typeof payload === 'object' && payload ? payload : { result: payload }),
          verified: true,
          observed: check.evidence,
        });
      }

      h.emit('tool.completed', { tool: name, duration: Date.now() - started, status: 'success' });
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (e) {
      const msg = (e as Error).message;
      h.emit('tool.failed', { tool: name, error: msg });
      // Same reasoning as a denial — hand the failure back to the model.
      return JSON.stringify({ success: false, error: msg });
    }
  }

  /**
   * Runs a verifier without letting it become a new failure mode.
   *
   * A verifier that throws — a missing `tasklist`, a permissions error — must
   * not turn a working action into a reported failure. Unknown is treated as
   * verified, because the alternative is telling the user their app did not
   * open when it is sitting on screen in front of them.
   */
  private async observe(
    tool: ToolDefinition,
    args: unknown,
    result: unknown,
    ctx: ToolContext
  ): Promise<Verification> {
    try {
      return await tool.verify!(args, result, ctx);
    } catch (e) {
      return { verified: true, evidence: `Could not be checked (${(e as Error).message}).` };
    }
  }
}

export const tools = new ToolRegistry();
