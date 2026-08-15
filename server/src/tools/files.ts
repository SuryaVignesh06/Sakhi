import { readFile, writeFile, appendFile, readdir, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ToolContext } from './registry.js';

/**
 * File access, confined to one directory.
 *
 * The confinement is done with `path.resolve` + a prefix check on the RESOLVED
 * path, not by inspecting the requested string. String checks lose: `..%2f`,
 * `foo/../../bar`, absolute paths, and on Windows short names (`PROGRA~1`) and
 * alternate roots all defeat them. Resolving first collapses every one of those
 * into a real path, and the prefix test then either holds or does not.
 *
 * The separator is appended to the root before comparing so that a sibling
 * directory named `Sakhi-evil` cannot pass a bare `startsWith` against
 * `Sakhi`.
 */

export const FILES_ROOT = path.resolve(
  process.env.FF_FILES_ROOT ?? path.join(homedir(), 'Sakhi')
);

/**
 * Refuse anything that resolves outside the sandbox.
 *
 * The leading `/`, `\` and `~/` are stripped first because models write
 * `/notes.md` and `~/notes.md` meaning "at the top of my workspace" — the
 * sandbox is the only filesystem they can see. This is a convenience, not a
 * relaxation: the resolve-then-prefix test below still decides, so `/../etc`
 * becomes `../etc`, resolves outside, and is refused exactly as before.
 */
export function resolveInside(rel: string): string | null {
  const raw = String(rel ?? '').trim();

  /* A UNC path (\\server\share) is refused outright rather than stripped. It
     would otherwise land inside the sandbox as a "server\share" subfolder —
     contained, but silently meaning something else than the caller asked for.
     Saying no is clearer than quietly writing somewhere unexpected. */
  if (/^(\\\\|\/\/)/.test(raw)) return null;

  const cleaned = raw.replace(/^~(?=[/\\]|$)/, '').replace(/^[/\\]+/, '');
  const target = path.resolve(FILES_ROOT, cleaned);
  const root = FILES_ROOT.endsWith(path.sep) ? FILES_ROOT : FILES_ROOT + path.sep;
  if (target !== FILES_ROOT && !target.startsWith(root)) return null;
  return target;
}

const MAX_READ = 20_000;
const MAX_WRITE = 500_000;

export interface FilesArgs {
  action: 'read' | 'write' | 'append' | 'list';
  path?: string;
  content?: string;
}

const outside = (p: string) =>
  JSON.stringify({
    success: false,
    error: `"${p}" is outside the workspace. All paths are relative to ${FILES_ROOT}.`,
  });

export async function runFiles(args: FilesArgs, ctx: ToolContext): Promise<string> {
  const rel = String(args.path ?? '.');
  const target = resolveInside(rel);
  if (!target) return outside(rel);

  // Created on demand so a first run does not fail on a missing workspace.
  await mkdir(FILES_ROOT, { recursive: true }).catch(() => {});

  const shown = path.relative(FILES_ROOT, target) || '.';

  try {
    switch (args.action) {
      case 'list': {
        ctx.progress(50, `Listing ${shown}…`);
        const entries = await readdir(target, { withFileTypes: true });
        const items = await Promise.all(
          entries.slice(0, 200).map(async (e) => {
            const full = path.join(target, e.name);
            const size = e.isFile() ? await stat(full).then((s) => s.size).catch(() => undefined) : undefined;
            return { name: e.name, type: e.isDirectory() ? 'directory' : 'file', ...(size != null ? { size } : {}) };
          })
        );
        ctx.progress(100, 'Listed.');
        return JSON.stringify({ success: true, path: shown, root: FILES_ROOT, count: items.length, items });
      }

      case 'read': {
        ctx.progress(50, `Reading ${shown}…`);
        const text = await readFile(target, 'utf8');
        ctx.progress(100, 'Read.');
        return JSON.stringify({
          success: true,
          path: shown,
          content: text.slice(0, MAX_READ),
          truncated: text.length > MAX_READ,
          length: text.length,
        });
      }

      case 'write':
      case 'append': {
        const content = String(args.content ?? '');
        if (content.length > MAX_WRITE) {
          return JSON.stringify({ success: false, error: `Content is ${content.length} characters; the limit is ${MAX_WRITE}.` });
        }
        ctx.progress(50, `${args.action === 'write' ? 'Writing' : 'Appending to'} ${shown}…`);
        await mkdir(path.dirname(target), { recursive: true });
        if (args.action === 'write') await writeFile(target, content, 'utf8');
        else await appendFile(target, content, 'utf8');
        ctx.progress(100, 'Saved.');
        return JSON.stringify({
          success: true,
          path: shown,
          absolutePath: target,
          bytes: Buffer.byteLength(content),
          message: `${args.action === 'write' ? 'Wrote' : 'Appended'} ${content.length} characters to ${shown}.`,
        });
      }

      default:
        return JSON.stringify({
          success: false,
          error: `Unsupported action "${args.action}".`,
          actions: ['read', 'write', 'append', 'list'],
        });
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return JSON.stringify({ success: false, error: `"${shown}" does not exist in the workspace.` });
    if (err.code === 'EISDIR') return JSON.stringify({ success: false, error: `"${shown}" is a directory. Use action "list".` });
    if (err.code === 'ENOTDIR') return JSON.stringify({ success: false, error: `"${shown}" is a file. Use action "read".` });
    return JSON.stringify({ success: false, error: `${args.action} failed: ${err.message}` });
  }
}

export const FILES_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['read', 'write', 'append', 'list'],
      description: 'What to do with the file or folder.',
    },
    path: {
      type: 'string',
      description:
        `Path relative to the workspace folder (${FILES_ROOT}). ` +
        'Use "." for the workspace root. Paths outside it are refused.',
    },
    content: { type: 'string', description: 'For write and append. The text to save.' },
  },
  required: ['action', 'path'],
} as const;
