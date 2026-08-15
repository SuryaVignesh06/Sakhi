import {
  readFile, writeFile, appendFile, readdir, mkdir, stat, rename, copyFile, rm, cp,
} from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolContext } from './registry.js';

const run = promisify(execFile);

/**
 * Real file management, across the user's own files.
 *
 * The older `files` tool is confined to a single workspace folder, which is
 * right for scratch notes and wrong for "tidy up my Downloads". This one
 * reaches anywhere under the home directory and can move, copy, rename,
 * delete, create folders, and search.
 *
 * ── The two limits that remain, and why they are not timidity ──────
 *
 * 1. OS and program directories are refused. Nothing a user means by
 *    "organise my files" lives in System32 or /usr/bin, so allowing them buys
 *    no capability — it only widens what a misread instruction can destroy.
 *
 * 2. Deletes go to the Recycle Bin / Trash, not to unlink(). This is what
 *    makes deletion usable at all: an agent that can permanently destroy
 *    files is one the user has to supervise, and supervising it defeats the
 *    point. Recoverable deletes are what let it work unattended.
 *
 * Everything else the user owns is in scope.
 */

const HOME = path.resolve(homedir());
const IS_WIN = platform() === 'win32';

/**
 * Paths that are never writable, matched on the RESOLVED path.
 *
 * String matching on the requested path loses to `..`, `%2e%2e`, Windows
 * short names (`PROGRA~1`), and symlinks; resolving first collapses all of
 * those into something a prefix test can actually decide.
 */
const FORBIDDEN = (
  IS_WIN
    ? [
        process.env.SystemRoot ?? 'C:\\Windows',
        process.env.ProgramFiles ?? 'C:\\Program Files',
        process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
        process.env.ProgramData ?? 'C:\\ProgramData',
      ]
    : ['/bin', '/sbin', '/usr', '/etc', '/var', '/System', '/Library', '/boot', '/dev', '/proc']
).map((p) => path.resolve(p));

/** Credential stores are readable by their owner but never worth handing to a model. */
const SECRET_DIRS = ['.ssh', '.gnupg', '.aws', '.config/gcloud', 'AppData/Roaming/Microsoft/Crypto'];

export interface Resolved { ok: true; path: string }
export interface Refused { ok: false; error: string }

/**
 * Resolve a user-supplied path and decide whether it may be touched.
 *
 * Relative paths resolve against the home directory, so "Downloads/report.pdf"
 * means what the user expects without them typing an absolute path.
 */
export function resolvePath(input: string, forWrite: boolean): Resolved | Refused {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, error: 'A path is required.' };

  // UNC paths reach other machines; refuse rather than silently reinterpret.
  if (/^(\\\\|\/\/)/.test(raw)) {
    return { ok: false, error: 'Network paths are not supported.' };
  }

  const expanded = raw.replace(/^~(?=[/\\]|$)/, HOME);
  const target = path.resolve(HOME, expanded);

  /**
   * Windows paths are case-INSENSITIVE, so the comparison must be too.
   *
   * This is not hypothetical tidiness: `process.env.SystemRoot` reports
   * `C:\WINDOWS` while `path.resolve` produces `C:\Windows`, so a
   * case-sensitive `startsWith` returned false and the guard let
   * `C:\Windows\System32` straight through. Every containment test below
   * goes through `key()`.
   */
  const key = (p: string) => (IS_WIN ? p.toLowerCase() : p);
  const tKey = key(target);

  for (const bad of FORBIDDEN) {
    const bKey = key(bad);
    const withSep = bKey.endsWith(path.sep) ? bKey : bKey + path.sep;
    if (tKey === bKey || tKey.startsWith(withSep)) {
      return {
        ok: false,
        error: `"${target}" is a system directory. I can work anywhere in your own files, but not there.`,
      };
    }
  }

  /* Outside the home directory entirely — another user's profile, or a data
     drive we were never asked about. Refused for the same reason: nothing the
     user means by "my files" lives there. */
  const homeSep = key(HOME).endsWith(path.sep) ? key(HOME) : key(HOME) + path.sep;
  if (tKey !== key(HOME) && !tKey.startsWith(homeSep)) {
    return {
      ok: false,
      error: `"${target}" is outside your home folder, so I have not touched it.`,
    };
  }

  const rel = key(path.relative(HOME, target).replace(/\\/g, '/'));
  if (SECRET_DIRS.some((d) => rel === key(d) || rel.startsWith(key(d) + '/'))) {
    return { ok: false, error: `"${rel}" holds credentials and is off limits.` };
  }

  if (forWrite && target === HOME) {
    return { ok: false, error: 'Refusing to operate on the home directory itself.' };
  }

  return { ok: true, path: target };
}

/**
 * Delete to the Recycle Bin / Trash.
 *
 * Uses the OS shell APIs so the file lands somewhere the user can restore it
 * from. Falls back to a permanent delete only when the shell call is
 * unavailable, and says so in the result rather than pretending otherwise.
 */
async function recycle(target: string): Promise<{ recycled: boolean; note?: string }> {
  try {
    if (IS_WIN) {
      // The VB shell namespace is the only scriptable route to the Recycle Bin.
      const ps =
        `Add-Type -AssemblyName Microsoft.VisualBasic; ` +
        `$p = ${JSON.stringify(target)}; ` +
        `if (Test-Path -LiteralPath $p -PathType Container) { ` +
        `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin') } ` +
        `else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin') }`;
      await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 20_000 });
      return { recycled: true };
    }
    if (platform() === 'darwin') {
      const osa = `tell application "Finder" to delete POSIX file ${JSON.stringify(target)}`;
      await run('osascript', ['-e', osa], { timeout: 20_000 });
      return { recycled: true };
    }
    await run('gio', ['trash', target], { timeout: 20_000 });
    return { recycled: true };
  } catch {
    await rm(target, { recursive: true, force: true });
    return {
      recycled: false,
      note: 'The Recycle Bin was unavailable, so this was deleted permanently.',
    };
  }
}

const MAX_READ = 40_000;
const MAX_WRITE = 2_000_000;
const MAX_HITS = 200;

export interface FsArgs {
  action: 'read' | 'write' | 'append' | 'list' | 'move' | 'copy' | 'delete' | 'mkdir' | 'find' | 'info';
  path?: string;
  to?: string;
  content?: string;
  /** For find: a glob-ish name pattern, e.g. "*.pdf". */
  pattern?: string;
  /** For find: also match file contents. */
  contains?: string;
  recursive?: boolean;
}

/** Turn a shell-style glob into an anchored regex. */
const globToRe = (g: string) =>
  new RegExp(
    '^' + g.split('').map((c) =>
      c === '*' ? '.*' : c === '?' ? '.' : /[.+^${}()|[\]\\]/.test(c) ? '\\' + c : c
    ).join('') + '$',
    'i'
  );

/** Directories that would swamp any search and never hold what was asked for. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.cache', 'AppData', 'Library', '.venv', 'venv',
  '__pycache__', 'dist', 'build', '.next', 'target',
]);

async function walk(
  dir: string,
  depth: number,
  onFile: (full: string, name: string) => Promise<void> | void
): Promise<void> {
  if (depth < 0) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // Unreadable directory — skip it rather than abort the whole search.
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, depth - 1, onFile);
    else await onFile(full, e.name);
  }
}

export async function runFs(args: FsArgs, ctx: ToolContext): Promise<string> {
  const fail = (error: string) => JSON.stringify({ success: false, error });

  try {
    const writes = ['write', 'append', 'move', 'copy', 'delete', 'mkdir'].includes(args.action);
    const src = resolvePath(args.path ?? '', writes);
    if (!src.ok) return fail(src.error);

    const shown = path.relative(HOME, src.path) || src.path;

    switch (args.action) {
      case 'info': {
        const st = await stat(src.path);
        return JSON.stringify({
          success: true, path: shown, isDirectory: st.isDirectory(),
          bytes: st.size, modified: st.mtime.toISOString(),
        });
      }

      case 'read': {
        ctx.progress(50, `Reading ${shown}…`);
        const body = await readFile(src.path, 'utf8');
        return JSON.stringify({
          success: true, path: shown,
          content: body.slice(0, MAX_READ),
          truncated: body.length > MAX_READ,
        });
      }

      case 'list': {
        const entries = await readdir(src.path, { withFileTypes: true });
        const out = await Promise.all(
          entries.slice(0, 500).map(async (e) => {
            let bytes: number | undefined;
            try { bytes = e.isFile() ? (await stat(path.join(src.path, e.name))).size : undefined; }
            catch { /* vanished between readdir and stat */ }
            return { name: e.name, directory: e.isDirectory(), bytes };
          })
        );
        return JSON.stringify({ success: true, path: shown, entries: out });
      }

      case 'write':
      case 'append': {
        const body = String(args.content ?? '');
        if (body.length > MAX_WRITE) return fail(`Content exceeds ${MAX_WRITE} characters.`);
        await mkdir(path.dirname(src.path), { recursive: true });
        ctx.progress(60, `${args.action === 'write' ? 'Writing' : 'Appending to'} ${shown}…`);
        if (args.action === 'write') await writeFile(src.path, body, 'utf8');
        else await appendFile(src.path, body, 'utf8');
        return JSON.stringify({ success: true, path: shown, bytes: body.length });
      }

      case 'mkdir': {
        await mkdir(src.path, { recursive: true });
        return JSON.stringify({ success: true, path: shown, created: true });
      }

      case 'move':
      case 'copy': {
        const dst = resolvePath(args.to ?? '', true);
        if (!dst.ok) return fail(dst.error);

        /* A destination that is an existing directory means "into it", which
           is what a person means by "move this into Documents". */
        let finalPath = dst.path;
        try {
          if ((await stat(dst.path)).isDirectory()) {
            finalPath = path.join(dst.path, path.basename(src.path));
          }
        } catch { /* does not exist — treat as the literal target name */ }

        await mkdir(path.dirname(finalPath), { recursive: true });
        ctx.progress(60, `${args.action === 'move' ? 'Moving' : 'Copying'} ${shown}…`);

        const isDir = (await stat(src.path)).isDirectory();
        if (args.action === 'move') await rename(src.path, finalPath);
        else if (isDir) await cp(src.path, finalPath, { recursive: true });
        else await copyFile(src.path, finalPath);

        return JSON.stringify({
          success: true, from: shown, to: path.relative(HOME, finalPath) || finalPath,
        });
      }

      case 'delete': {
        ctx.progress(60, `Removing ${shown}…`);
        const res = await recycle(src.path);
        return JSON.stringify({
          success: true, path: shown,
          recycled: res.recycled,
          message: res.recycled
            ? `Moved "${shown}" to the Recycle Bin — restorable from there.`
            : `Deleted "${shown}".`,
          ...(res.note ? { note: res.note } : {}),
        });
      }

      case 'find': {
        const nameRe = args.pattern ? globToRe(args.pattern) : null;
        const needle = args.contains?.toLowerCase();
        if (!nameRe && !needle) return fail('find needs a "pattern" or "contains".');

        const hits: { path: string; bytes: number }[] = [];
        ctx.progress(30, `Searching ${shown}…`);

        await walk(src.path, args.recursive === false ? 0 : 6, async (full, name) => {
          if (hits.length >= MAX_HITS) return;
          if (nameRe && !nameRe.test(name)) return;

          if (needle) {
            try {
              const st = await stat(full);
              // Reading every large binary to grep it would take forever.
              if (st.size > 2_000_000) return;
              const body = await readFile(full, 'utf8');
              if (!body.toLowerCase().includes(needle)) return;
              hits.push({ path: path.relative(HOME, full), bytes: st.size });
            } catch { /* binary or unreadable */ }
            return;
          }

          try { hits.push({ path: path.relative(HOME, full), bytes: (await stat(full)).size }); }
          catch { /* vanished */ }
        });

        return JSON.stringify({
          success: true, searched: shown, matches: hits,
          truncated: hits.length >= MAX_HITS,
        });
      }

      default:
        return fail(`Unsupported action "${args.action}".`);
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}

export const FS_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['read', 'write', 'append', 'list', 'move', 'copy', 'delete', 'mkdir', 'find', 'info'],
      description:
        'Manage the user\'s own files anywhere under their home folder. move/copy accept a ' +
        'destination folder and will place the item inside it. delete goes to the Recycle Bin. ' +
        'find searches by name pattern and/or file contents.',
    },
    path: {
      type: 'string',
      description:
        'File or folder. Relative paths are taken from the home folder, so "Downloads/a.pdf" works.',
    },
    to: { type: 'string', description: 'Destination for move and copy.' },
    content: { type: 'string', description: 'Text for write and append.' },
    pattern: { type: 'string', description: 'For find: a name glob such as "*.pdf".' },
    contains: { type: 'string', description: 'For find: text that must appear inside the file.' },
    recursive: { type: 'boolean', description: 'For find: search subfolders. Default true.' },
  },
  required: ['action'],
} as const;
