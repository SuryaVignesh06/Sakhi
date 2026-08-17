import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import type { ToolContext } from './registry.js';
import { resolvePath } from './filesystem.js';

const run = promisify(execFile);
const IS_WIN = platform() === 'win32';

/**
 * Connections to the developer tools already installed on this machine.
 *
 * Deliberately built on each app's own CLI rather than on window automation:
 * `code` and `git` are stable, scriptable contracts, whereas clicking through
 * a GUI breaks the moment a button moves. Anything without a CLI (GitHub
 * Desktop) is driven through the protocol handler it registers, which is the
 * supported way to talk to it.
 *
 * Every executable is looked up rather than assumed, so an app that is not
 * installed reports that plainly instead of failing with ENOENT.
 */

interface AppDef {
  id: string;
  label: string;
  /** Candidate commands, tried in order. */
  probes: { cmd: string; args: string[] }[];
  /** Extra places to look on Windows, where PATH often lacks the CLI. */
  fallbacks?: string[];
}

const APPS: AppDef[] = [
  {
    id: 'vscode',
    label: 'Visual Studio Code',
    probes: [{ cmd: 'code', args: ['--version'] }],
    fallbacks: IS_WIN
      ? [
          path.join(homedir(), 'AppData/Local/Programs/Microsoft VS Code/bin/code.cmd'),
          'C:/Program Files/Microsoft VS Code/bin/code.cmd',
        ]
      : ['/usr/local/bin/code', '/usr/bin/code'],
  },
  { id: 'git', label: 'Git', probes: [{ cmd: 'git', args: ['--version'] }] },
  {
    id: 'github-desktop',
    label: 'GitHub Desktop',
    probes: [{ cmd: 'github', args: ['--version'] }],
    fallbacks: IS_WIN
      ? [path.join(homedir(), 'AppData/Local/GitHubDesktop/GitHubDesktop.exe')]
      : ['/Applications/GitHub Desktop.app/Contents/MacOS/GitHub Desktop'],
  },
  { id: 'node', label: 'Node.js', probes: [{ cmd: 'node', args: ['--version'] }] },
  { id: 'python', label: 'Python', probes: [{ cmd: IS_WIN ? 'py' : 'python3', args: ['--version'] }] },
];

/** The working executable for an app, or null when it is not installed. */
async function locate(app: AppDef): Promise<{ exe: string; version: string } | null> {
  for (const p of app.probes) {
    try {
      const { stdout, stderr } = await run(p.cmd, p.args, { timeout: 8000, shell: IS_WIN });
      return { exe: p.cmd, version: (stdout || stderr).trim().split('\n')[0] };
    } catch {
      /* not on PATH — try the next candidate */
    }
  }
  for (const f of app.fallbacks ?? []) {
    try {
      await access(f);
      return { exe: f, version: 'installed' };
    } catch {
      /* not at this location */
    }
  }
  return null;
}

export interface AppsArgs {
  /* Kept in step with APPS_SCHEMA's enum below. A 'run' action was declared
     here but never implemented or advertised, so it could only ever have been
     reached by a model inventing it — and would have fallen through to
     "Unsupported action". */
  action: 'list' | 'open' | 'git';
  app?: string;
  /** File or folder to open. */
  path?: string;
  /** For git: the subcommand, e.g. "status". */
  command?: string;
  /** For git: the repository to run in. */
  repo?: string;
}

/**
 * Read-only git subcommands.
 *
 * Anything that rewrites history, moves refs, or reaches the network is
 * excluded: those are the operations where a misread instruction costs
 * someone their work, and they are better done deliberately by the user.
 */
const GIT_SAFE = new Set([
  'status', 'log', 'diff', 'branch', 'show', 'remote',
  'blame', 'shortlog', 'describe', 'config', 'ls-files', 'stash',
]);

export async function runApps(args: AppsArgs, ctx: ToolContext): Promise<string> {
  const fail = (error: string) => JSON.stringify({ success: false, error });

  try {
    if (args.action === 'list') {
      ctx.progress(40, 'Checking installed apps…');
      const found = await Promise.all(
        APPS.map(async (a) => {
          const hit = await locate(a);
          return { id: a.id, label: a.label, installed: Boolean(hit), version: hit?.version };
        })
      );
      return JSON.stringify({ success: true, apps: found });
    }

    if (args.action === 'open') {
      const def = APPS.find((a) => a.id === args.app);
      if (!def) return fail(`Unknown app "${args.app}". Use action "list" to see what is available.`);

      const hit = await locate(def);
      if (!hit) return fail(`${def.label} does not appear to be installed.`);

      const target = args.path ? resolvePath(args.path, false) : null;
      if (target && !target.ok) return fail(target.error);

      ctx.progress(60, `Opening ${def.label}…`);

      if (def.id === 'github-desktop') {
        /* GitHub Desktop has no useful CLI; its registered protocol handler is
           the supported way in. `start`/`open` hands the URL to the OS. */
        const url = target ? `github-windows://openLocalRepo/${encodeURIComponent(target.path)}` : 'github-windows://';
        if (IS_WIN) await run('cmd', ['/c', 'start', '', url], { timeout: 10_000 });
        else await run('open', [url], { timeout: 10_000 });
        return JSON.stringify({ success: true, opened: def.label, path: target?.path });
      }

      /* `shell` is required on Windows because the VS Code launcher is a .cmd
         shim, which cannot be executed directly. But a shell re-splits its
         command line on spaces, and both the fallback exe
         ("…\Microsoft VS Code\bin\code.cmd") and the folder being opened
         routinely contain them — so each has to be quoted to survive as one
         token. Without this, opening a project in VS Code failed for anyone
         whose `code` was not on PATH. */
      const quote = (s: string) => (IS_WIN && /\s/.test(s) ? `"${s}"` : s);
      const argv = target ? [quote(target.path)] : [];
      await run(quote(hit.exe), argv, { timeout: 15_000, shell: IS_WIN });
      return JSON.stringify({ success: true, opened: def.label, path: target?.path });
    }

    if (args.action === 'git') {
      const sub = String(args.command ?? '').trim().split(/\s+/);
      const verb = sub[0];
      if (!verb) return fail('A git subcommand is required, e.g. "status".');
      if (!GIT_SAFE.has(verb)) {
        return fail(
          `"${verb}" changes the repository or reaches the network. ` +
          `I can run read-only git commands: ${[...GIT_SAFE].join(', ')}.`
        );
      }

      const repo = resolvePath(args.repo ?? '.', false);
      if (!repo.ok) return fail(repo.error);

      ctx.progress(60, `git ${verb}…`);
      const { stdout, stderr } = await run('git', ['-C', repo.path, ...sub], {
        timeout: 20_000,
        maxBuffer: 4_000_000,
      });
      return JSON.stringify({
        success: true, command: `git ${sub.join(' ')}`,
        output: (stdout || stderr).slice(0, 20_000),
      });
    }

    return fail(`Unsupported action "${args.action}".`);
  } catch (e) {
    const err = e as Error & { stdout?: string; stderr?: string };
    // A non-zero exit is often still useful output (git diff, a failing build).
    const text = (err.stdout || err.stderr || '').trim();
    if (text) return JSON.stringify({ success: true, output: text.slice(0, 20_000), exitedNonZero: true });
    return fail(err.message);
  }
}

export const APPS_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['list', 'open', 'git'],
      description:
        'list reports which developer apps are installed. open launches one, optionally on a ' +
        'file or folder — use it for "open this project in VS Code" or "open this repo in ' +
        'GitHub Desktop". git runs a read-only git command in a repository.',
    },
    app: {
      type: 'string',
      enum: ['vscode', 'github-desktop', 'git', 'node', 'python'],
      description: 'Which app to open.',
    },
    path: { type: 'string', description: 'File or folder to open in the app.' },
    command: { type: 'string', description: 'For git: e.g. "status", "log --oneline -10".' },
    repo: { type: 'string', description: 'For git: the repository folder. Defaults to home.' },
  },
  required: ['action'],
} as const;
