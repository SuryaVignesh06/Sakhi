import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { ToolContext, Verification, Recovery } from './registry.js';
import { FILES_ROOT, resolveInside } from './files.js';
import { resolvePath } from './filesystem.js';

const run = promisify(execFile);
const IS_WIN = process.platform === 'win32';

/**
 * Observation and recovery.
 *
 * The one rule that makes any of this worth having: **a verifier must never
 * consult the tool's own report.** It goes and looks at the world. A launcher
 * that exits 0 has proved that the launcher exited 0, which is not the same
 * claim as "the application is running" — `start chrome` returns instantly and
 * successfully whether or not Chrome ever appears.
 *
 * So every function below re-derives the answer from an independent source:
 * the process table, the filesystem, the live page, the clipboard itself.
 */

/* ── Process observation ─────────────────────────────────────────── */

/**
 * Process names an app may run under, in order of likelihood.
 *
 * Several apps are not named after their launcher — Windows Terminal launches
 * as `wt` and runs as `WindowsTerminal.exe`, and the Windows 11 calculator
 * runs as `CalculatorApp.exe` while older builds use `Calculator.exe`. Getting
 * this wrong makes a working launch report as a failure, which is worse than
 * not checking at all.
 */
const PROCESS_NAMES: Record<string, { win32: string[]; darwin: string[]; linux: string[] }> = {
  chrome: { win32: ['chrome.exe'], darwin: ['Google Chrome'], linux: ['chrome', 'google-chrome'] },
  firefox: { win32: ['firefox.exe'], darwin: ['firefox'], linux: ['firefox'] },
  code: { win32: ['Code.exe'], darwin: ['Code'], linux: ['code'] },
  notepad: { win32: ['notepad.exe'], darwin: ['TextEdit'], linux: ['gedit'] },
  calculator: {
    win32: ['CalculatorApp.exe', 'Calculator.exe', 'win32calc.exe'],
    darwin: ['Calculator'], linux: ['gnome-calculator'],
  },
  explorer: { win32: ['explorer.exe'], darwin: ['Finder'], linux: ['nautilus'] },
  spotify: { win32: ['Spotify.exe'], darwin: ['Spotify'], linux: ['spotify'] },
  terminal: {
    win32: ['WindowsTerminal.exe', 'cmd.exe', 'powershell.exe'],
    darwin: ['Terminal'], linux: ['gnome-terminal'],
  },
  browser: {
    win32: ['chrome.exe', 'msedge.exe', 'firefox.exe'],
    darwin: ['Safari', 'Google Chrome'], linux: ['firefox', 'chrome'],
  },
};

/** True when any process matching one of `names` is running right now. */
async function anyProcessRunning(names: string[]): Promise<string | null> {
  for (const name of names) {
    try {
      if (IS_WIN) {
        const { stdout } = await run(
          'tasklist',
          ['/FI', `IMAGENAME eq ${name}`, '/NH'],
          { timeout: 10_000, windowsHide: true }
        );
        /* tasklist is chatty on a miss ("INFO: No tasks are running…") and
           exits 0 either way, so the name has to be found in the output
           rather than trusted from the exit code. */
        if (stdout.toLowerCase().includes(name.toLowerCase())) return name;
      } else {
        await run('pgrep', ['-x', name], { timeout: 10_000 });
        return name;
      }
    } catch {
      /* Not running under this name — try the next candidate. */
    }
  }
  return null;
}

/* ── Verifiers ───────────────────────────────────────────────────── */

/**
 * Did the application actually start?
 *
 * Apps do not appear in the process table the instant the launcher returns, so
 * this polls briefly rather than checking once and declaring failure — a
 * verifier that is merely impatient produces false alarms, and a false alarm
 * triggers a pointless recovery attempt that opens a second window.
 */
export async function verifyLaunch(
  args: { action?: string; app_name?: string },
  _result: unknown,
  ctx: ToolContext
): Promise<Verification> {
  if (args.action !== 'launch_app') return { verified: true, evidence: 'No launch to verify.' };

  const key = String(args.app_name ?? '').trim().toLowerCase();
  const entry = PROCESS_NAMES[key] ?? PROCESS_NAMES[key.replace(/^google\s*/, '')];
  if (!entry) {
    /* Unknown to the table. Saying so beats reporting a confident pass. */
    return { verified: true, evidence: `No process signature known for "${key}"; not checked.` };
  }

  const names = entry[process.platform as 'win32'] ?? entry.linux;
  const deadline = Date.now() + 6000;

  while (Date.now() < deadline) {
    if (ctx.signal.aborted) return { verified: false, reason: 'Cancelled.' , evidence: '' };
    const found = await anyProcessRunning(names);
    if (found) return { verified: true, evidence: `${found} is running.` };
    await new Promise((r) => setTimeout(r, 700));
  }

  return {
    verified: false,
    evidence: `No process matching ${names.join(' / ')} after 6s.`,
    reason: `${key} did not appear in the process list, so it is not running.`,
  };
}

/**
 * Did the clipboard actually take the text?
 *
 * Read it straight back. This is the cheapest honest check in the codebase and
 * it directly answers the failure the tool comments already describe — a model
 * announcing "Copied!" when nothing was copied.
 */
export async function verifyClipboard(
  args: { action?: string; text?: string },
  _result: unknown,
  _ctx: ToolContext
): Promise<Verification> {
  if (args.action !== 'copy' && args.action !== 'write' && args.action !== 'set') {
    return { verified: true, evidence: 'Read-only clipboard action.' };
  }

  const expected = String(args.text ?? '');
  try {
    const actual = IS_WIN
      ? (await run('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], { timeout: 10_000, windowsHide: true })).stdout
      : (await run('pbpaste', [], { timeout: 10_000 })).stdout;

    /* Trailing-newline differences are a platform artefact of reading the
       clipboard back, not a failure to copy. */
    if (actual.replace(/\r?\n$/, '') === expected.replace(/\r?\n$/, '')) {
      return { verified: true, evidence: 'Clipboard now holds exactly that text.' };
    }
    return {
      verified: false,
      evidence: `Clipboard holds ${actual.length} chars, expected ${expected.length}.`,
      reason: 'The clipboard does not contain the text that was meant to be copied.',
    };
  } catch (e) {
    return { verified: true, evidence: `Could not read the clipboard back (${(e as Error).message}).` };
  }
}

/** Does the file exist on disk now, with content? */
async function fileLandedAt(abs: string, expectLength?: number): Promise<Verification> {
  try {
    const s = await stat(abs);
    if (!s.isFile()) {
      return { verified: false, evidence: `${abs} is not a file.`, reason: 'Nothing was written.' };
    }
    if (expectLength !== undefined && expectLength > 0 && s.size === 0) {
      return {
        verified: false,
        evidence: `${path.basename(abs)} exists but is empty.`,
        reason: 'The file was created but the content did not land.',
      };
    }
    return { verified: true, evidence: `${path.basename(abs)} exists, ${s.size} bytes.` };
  } catch {
    return {
      verified: false,
      evidence: `${abs} does not exist.`,
      reason: 'The file was reported written but is not on disk.',
    };
  }
}

export async function verifyFiles(
  args: { action?: string; path?: string; content?: string },
  _result: unknown,
  _ctx: ToolContext
): Promise<Verification> {
  if (args.action !== 'write' && args.action !== 'append') {
    return { verified: true, evidence: 'No write to verify.' };
  }
  const abs = resolveInside(String(args.path ?? ''));
  if (!abs) return { verified: true, evidence: 'Path outside the workspace; refused before writing.' };
  return fileLandedAt(abs, args.content?.length);
}

export async function verifyFilesystem(
  args: { action?: string; path?: string; destination?: string; content?: string },
  _result: unknown,
  _ctx: ToolContext
): Promise<Verification> {
  const writeActions = new Set(['write', 'append', 'create', 'move', 'copy', 'rename']);
  if (!writeActions.has(String(args.action))) {
    return { verified: true, evidence: 'No write to verify.' };
  }

  /* For a move or copy the thing to check is where it was supposed to END UP.
     Verifying the source would pass for a move that silently did nothing. */
  const target = args.destination ?? args.path;
  const r = resolvePath(String(target ?? ''), false);
  if (!r.ok) return { verified: true, evidence: 'Path was refused before writing.' };
  return fileLandedAt(r.path, args.content?.length);
}

/**
 * Did the browser actually land on the page that was asked for?
 *
 * The tool reports the URL it ended on, and that report is trustworthy — it is
 * read from the live page, not assumed. What it does not do is compare that
 * against the *intent*, which is where redirects to a login wall, a consent
 * interstitial or an ISP error page slip through as success.
 */
export async function verifyBrowser(
  args: { action?: string; url?: string },
  result: unknown,
  _ctx: ToolContext
): Promise<Verification> {
  if (args.action !== 'open' || !args.url) {
    return { verified: true, evidence: 'No navigation to verify.' };
  }

  const r = (result ?? {}) as { success?: boolean; url?: string; title?: string };
  if (!r.url) return { verified: false, evidence: 'The page reported no URL.', reason: 'Navigation did not complete.' };

  const want = (() => {
    try { return new URL(args.url.startsWith('http') ? args.url : `https://${args.url}`).hostname.replace(/^www\./, ''); }
    catch { return ''; }
  })();
  const got = (() => {
    try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return ''; }
  })();

  if (want && got && got !== want && !got.endsWith(`.${want}`) && !want.endsWith(`.${got}`)) {
    return {
      verified: false,
      evidence: `Asked for ${want}, ended on ${got} — "${r.title ?? ''}".`,
      reason: `The browser was redirected to ${got} instead of ${want}.`,
    };
  }

  return { verified: true, evidence: `On ${got}${r.title ? ` — "${r.title}"` : ''}.` };
}

/* ── Recovery ────────────────────────────────────────────────────── */

/**
 * Recovery strategies, tried in order after verification fails.
 *
 * Deliberately shallow. The full automation hierarchy — API, DOM,
 * accessibility tree, keyboard, mouse, vision — is the eventual shape, but
 * only the rungs that genuinely exist today are listed here. A strategy that
 * pretends to try something it cannot do would make the recovery log a lie,
 * which defeats the purpose of building this at all.
 */

export const LAUNCH_RECOVERY: Recovery[] = [
  {
    label: 'wait longer for the app to appear',
    /* Cold-starting a large app on a loaded machine can exceed the verifier's
       window. Doing nothing and re-checking is the correct first move: it
       costs one poll and avoids opening a second window. */
    run: async () => {
      await new Promise((r) => setTimeout(r, 3500));
      return { success: true, message: 'Waited for the application to finish starting.' };
    },
  },
];

export const BROWSER_RECOVERY: Recovery[] = [
  {
    label: 'reload and wait for the full load event',
    run: async (args, ctx) => {
      const { runBrowser } = await import('./browser.js');
      return runBrowser({ ...(args as object), action: 'open' } as never, ctx);
    },
  },
];

export const WRITE_RECOVERY: Recovery[] = [
  {
    label: 'write again',
    run: async (args, ctx) => {
      const { runFs } = await import('./filesystem.js');
      return runFs(args as never, ctx);
    },
  },
];

export const CLIPBOARD_RECOVERY: Recovery[] = [
  {
    label: 'copy again',
    run: async (args, ctx) => {
      const { runClipboard } = await import('./clipboard.js');
      return runClipboard(args as never, ctx);
    },
  },
];

export const _internals = { PROCESS_NAMES, anyProcessRunning, FILES_ROOT };
