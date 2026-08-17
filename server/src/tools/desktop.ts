import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ToolContext } from './registry.js';
import { listProfiles, openChrome, setDefaultProfile } from './chrome.js';

const execFileAsync = promisify(execFile);

export interface FileMatch {
  name: string;
  path: string;
}

async function searchLocalFiles(query: string): Promise<FileMatch[]> {
  const normQuery = query.toLowerCase().trim().replace(/^['"]|['"]$/g, '');
  if (!normQuery) return [];

  const searchDirs = [
    path.join(homedir(), 'Desktop'),
    path.join(homedir(), 'Documents'),
    path.join(homedir(), 'Downloads'),
    process.cwd(),
  ];

  const matches: FileMatch[] = [];
  const seenPaths = new Set<string>();

  for (const dir of searchDirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        const nameLower = entry.name.toLowerCase();

        if (nameLower.includes(normQuery) || normQuery.includes(nameLower)) {
          if (!seenPaths.has(fullPath)) {
            seenPaths.add(fullPath);
            matches.push({ name: entry.name, path: fullPath });
          }
        }
      }
    } catch {
      /* ignore unreadable directory */
    }
  }

  return matches;
}

async function openPathWithOS(targetPath: string, signal?: AbortSignal) {
  if (process.platform === 'win32') {
    await execFileAsync('cmd', ['/c', 'start', '', targetPath], { shell: false, windowsHide: true, timeout: 15_000, signal });
  } else if (process.platform === 'darwin') {
    await execFileAsync('open', [targetPath], { shell: false, timeout: 15_000, signal });
  } else {
    await execFileAsync('xdg-open', [targetPath], { shell: false, timeout: 15_000, signal });
  }
}

export async function openFileOrPath(query: string, ctx: ToolContext): Promise<string> {
  const trimmed = query.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) return JSON.stringify({ success: false, error: 'File name or path is required.' });

  ctx.progress?.(20, `Searching for "${trimmed}"…`);

  // Direct path check first
  try {
    const isAbsolute = path.isAbsolute(trimmed);
    const resolvedPath = isAbsolute ? trimmed : path.resolve(trimmed);
    const st = await stat(resolvedPath).catch(() => null);
    if (st) {
      ctx.progress?.(60, `Opening ${path.basename(resolvedPath)}…`);
      await openPathWithOS(resolvedPath, ctx.signal);
      return JSON.stringify({
        success: true,
        opened: path.basename(resolvedPath),
        path: resolvedPath,
        message: `Opened ${path.basename(resolvedPath)}.`,
      });
    }
  } catch {}

  // Search matching files across Desktop, Documents, Downloads, CWD
  const matches = await searchLocalFiles(trimmed);

  if (matches.length === 1) {
    const hit = matches[0];
    ctx.progress?.(60, `Opening ${hit.name}…`);
    await openPathWithOS(hit.path, ctx.signal);
    return JSON.stringify({
      success: true,
      opened: hit.name,
      path: hit.path,
      message: `Opened ${hit.name}.`,
    });
  }

  if (matches.length > 1) {
    ctx.progress?.(100, 'Multiple matching files found.');
    return JSON.stringify({
      success: false,
      ambiguous: true,
      message: `Found ${matches.length} files matching "${trimmed}". Ask the user which of these files they would like to open: ${matches.map(m => m.name).join(', ')}.`,
      choices: matches.map((m, idx) => `${idx + 1}. ${m.name} (${m.path})`),
    });
  }

  // Fallback: try opening with OS directly
  try {
    ctx.progress?.(50, `Attempting OS launch for "${trimmed}"…`);
    await openPathWithOS(trimmed, ctx.signal);
    return JSON.stringify({
      success: true,
      opened: trimmed,
      message: `Opened ${trimmed}.`,
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: `Could not find or open any file matching "${trimmed}".`,
    });
  }
}

/**
 * Desktop control — launching applications.
 *
 * SECURITY: the app name originates from the model, which is influenced by user
 * input and (once the browser tool lands) by page content. It is therefore
 * untrusted. Two rules follow, and neither is negotiable:
 *
 *   1. Never build a shell string. `execFile` with an argv array and
 *      `shell: false` means metacharacters (; | & ` $() etc.) are inert —
 *      they are passed as literal characters, not interpreted.
 *   2. Never launch an arbitrary path. Only names in ALLOWED resolve, so a
 *      prompt injection cannot reach an unlisted binary even if it defeats
 *      everything else.
 *
 * A string-interpolated `exec("start \"\" \"" + appName + "\"")` fails both:
 * an app_name of `x" & calc & "` would run calc.
 */

interface AppTarget {
  win32?: { file: string; args: string[] };
  darwin?: { file: string; args: string[] };
  linux?: { file: string; args: string[] };
}

/* Each entry names a real launcher and its arguments separately. Nothing here
   is concatenated, so nothing here can be escaped out of. */
const ALLOWED: Record<string, AppTarget> = {
  browser: {
    win32: { file: 'cmd', args: ['/c', 'start', '', 'https://'] },
    darwin: { file: 'open', args: ['-a', 'Safari'] },
    linux: { file: 'xdg-open', args: ['https://'] },
  },
  chrome: {
    win32: { file: 'cmd', args: ['/c', 'start', '', 'chrome'] },
    darwin: { file: 'open', args: ['-a', 'Google Chrome'] },
    linux: { file: 'google-chrome', args: [] },
  },
  firefox: {
    win32: { file: 'cmd', args: ['/c', 'start', '', 'firefox'] },
    darwin: { file: 'open', args: ['-a', 'Firefox'] },
    linux: { file: 'firefox', args: [] },
  },
  code: {
    win32: { file: 'cmd', args: ['/c', 'start', '', 'code'] },
    darwin: { file: 'open', args: ['-a', 'Visual Studio Code'] },
    linux: { file: 'code', args: [] },
  },
  terminal: {
    win32: { file: 'cmd', args: ['/c', 'start', '', 'wt'] },
    darwin: { file: 'open', args: ['-a', 'Terminal'] },
    linux: { file: 'gnome-terminal', args: [] },
  },
  notepad: {
    win32: { file: 'notepad', args: [] },
    darwin: { file: 'open', args: ['-a', 'TextEdit'] },
    linux: { file: 'gedit', args: [] },
  },
  calculator: {
    win32: { file: 'cmd', args: ['/c', 'start', '', 'calc'] },
    darwin: { file: 'open', args: ['-a', 'Calculator'] },
    linux: { file: 'gnome-calculator', args: [] },
  },
  explorer: {
    win32: { file: 'explorer', args: [] },
    darwin: { file: 'open', args: ['-a', 'Finder'] },
    linux: { file: 'nautilus', args: [] },
  },
  spotify: {
    win32: { file: 'cmd', args: ['/c', 'start', '', 'spotify'] },
    darwin: { file: 'open', args: ['-a', 'Spotify'] },
    linux: { file: 'spotify', args: [] },
  },
};

/** Common ways a model might name an app, mapped onto a canonical key. */
const ALIASES: Record<string, string> = {
  'vs code': 'code',
  vscode: 'code',
  'visual studio code': 'code',
  'google chrome': 'chrome',
  'web browser': 'browser',
  safari: 'browser',
  edge: 'browser',
  'microsoft edge': 'browser',
  'file explorer': 'explorer',
  finder: 'explorer',
  files: 'explorer',
  calc: 'calculator',
  'text editor': 'notepad',
  textedit: 'notepad',
  cmd: 'terminal',
  powershell: 'terminal',
  'command prompt': 'terminal',
};

export function listApps(): string[] {
  const p = process.platform as keyof AppTarget;
  return Object.entries(ALLOWED)
    .filter(([, t]) => t[p])
    .map(([name]) => name);
}

function resolve(raw: string): { key: string; target: AppTarget[keyof AppTarget] } | null {
  const norm = String(raw ?? '').trim().toLowerCase();
  const key = ALIASES[norm] ?? norm;
  const entry = ALLOWED[key];
  if (!entry) return null;
  const target = entry[process.platform as keyof AppTarget];
  return target ? { key, target } : null;
}

export interface DesktopArgs {
  action:
    | 'launch_app' | 'list_apps' | 'open_url' | 'open_file' | 'notify'
    | 'list_profiles' | 'set_default_profile';
  /** For open_url: which browser to use, e.g. "chrome". */
  browser?: string;
  /** For launch_app on Chrome: which signed-in profile to open. */
  profile?: string;
  app_name?: string;
  file_path?: string;
  url?: string;
  message?: string;
  title?: string;
}

/**
 * Opens a URL in the default browser.
 *
 * The scheme allow-list is the whole security control here: without it,
 * `file:///C:/...` would exfiltrate local files into a browser window and
 * `javascript:` / custom protocol handlers would be reachable from a prompt.
 */
async function openUrl(raw: string, ctx: ToolContext): Promise<string> {
  let url: URL;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    return JSON.stringify({
      success: false,
      error: `"${raw}" is not a valid absolute URL. Include the scheme, e.g. https://example.com.`,
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return JSON.stringify({
      success: false,
      error: `Only http and https URLs can be opened (got "${url.protocol}").`,
    });
  }

  ctx.progress(50, `Opening ${url.hostname}…`);

  // Passed as an argv element, never interpolated into a command line.
  const target: Record<string, { file: string; args: string[] }> = {
    win32: { file: 'cmd', args: ['/c', 'start', '', url.href] },
    darwin: { file: 'open', args: [url.href] },
    linux: { file: 'xdg-open', args: [url.href] },
  };
  const t = target[process.platform] ?? target.linux;

  try {
    await execFileAsync(t.file, t.args, { shell: false, windowsHide: true, timeout: 15_000, signal: ctx.signal });
  } catch (e) {
    return JSON.stringify({ success: false, error: `Could not open the URL: ${(e as Error).message}` });
  }

  ctx.progress(100, 'Opened.');
  return JSON.stringify({ success: true, message: `Opened ${url.href} in the default browser.`, url: url.href });
}

/**
 * A desktop notification.
 *
 * Windows has no notification binary to exec, so this goes through PowerShell —
 * which means the text IS interpolated into a script. It is therefore escaped
 * for single-quoted PowerShell (doubling `'`) and length-capped, and the script
 * body contains no other expansion point.
 */
async function notify(title: string, message: string, ctx: ToolContext): Promise<string> {
  const t = String(title || 'Sakhi').slice(0, 80);
  const m = String(message ?? '').slice(0, 300);
  if (!m.trim()) return JSON.stringify({ success: false, error: 'A "message" is required.' });

  const psq = (s: string) => s.replace(/'/g, "''");
  ctx.progress(50, 'Sending notification…');

  try {
    if (process.platform === 'win32') {
      const script =
        `[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');` +
        `$n = New-Object System.Windows.Forms.NotifyIcon;` +
        `$n.Icon = [System.Drawing.SystemIcons]::Information;` +
        `$n.BalloonTipTitle = '${psq(t)}';` +
        `$n.BalloonTipText = '${psq(m)}';` +
        `$n.Visible = $true; $n.ShowBalloonTip(6000); Start-Sleep -Seconds 6; $n.Dispose()`;
      await execFileAsync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
        { shell: false, windowsHide: true, timeout: 20_000, signal: ctx.signal }
      );
    } else if (process.platform === 'darwin') {
      await execFileAsync(
        'osascript',
        ['-e', `display notification "${m.replace(/"/g, '\\"')}" with title "${t.replace(/"/g, '\\"')}"`],
        { shell: false, timeout: 15_000, signal: ctx.signal }
      );
    } else {
      await execFileAsync('notify-send', [t, m], { shell: false, timeout: 15_000, signal: ctx.signal });
    }
  } catch (e) {
    return JSON.stringify({ success: false, error: `Could not show the notification: ${(e as Error).message}` });
  }

  ctx.progress(100, 'Notified.');
  return JSON.stringify({ success: true, message: `Showed a desktop notification: "${m}"` });
}

export async function runDesktop(args: DesktopArgs, ctx: ToolContext): Promise<string> {
  if (args.action === 'list_apps') {
    return JSON.stringify({ success: true, apps: listApps() });
  }

  if (args.action === 'open_file') {
    const fileTarget = args.file_path || args.app_name || '';
    return openFileOrPath(fileTarget, ctx);
  }

  if (args.action === 'open_url') {
    /* "Open it in Chrome" has to actually mean Chrome. Without this the URL
       went to the OS default browser regardless of what was asked for. */
    const want = String(args.browser ?? '').trim().toLowerCase();
    if (/^(chrome|google\s*chrome)$/.test(want)) {
      const res = await openChrome({ profile: args.profile, url: args.url });
      if (!res.ok) return JSON.stringify({ success: false, error: res.error, profiles: res.choices });
      return JSON.stringify({
        success: true,
        opened: args.url,
        browser: 'chrome',
        profile: res.profile?.name ?? null,
      });
    }
    return openUrl(args.url ?? '', ctx);
  }

  /* Remembering which account to use, so it only has to be asked once. */
  if (args.action === 'set_default_profile') {
    const name = String(args.profile ?? '').trim();
    if (!name) return JSON.stringify({ success: false, error: 'A "profile" is required.' });
    const profiles = await listProfiles();
    const hit = profiles.find(
      (p) =>
        p.directory.toLowerCase() === name.toLowerCase() ||
        p.name.toLowerCase() === name.toLowerCase() ||
        p.name.toLowerCase().includes(name.toLowerCase())
    );
    if (!hit) {
      return JSON.stringify({ success: false, error: `No Chrome profile matches "${name}".`, profiles });
    }
    await setDefaultProfile(hit.directory);
    return JSON.stringify({
      success: true,
      message: `Chrome will open as ${hit.name}${hit.email ? ` (${hit.email})` : ''} from now on.`,
    });
  }

  if (args.action === 'notify') {
    return notify(args.title ?? 'Sakhi', args.message ?? '', ctx);
  }

  /* Chrome's accounts, so the agent can ask which one rather than guessing
     and landing in a guest window. */
  if (args.action === 'list_profiles') {
    const profiles = await listProfiles();
    return JSON.stringify({
      success: true,
      profiles,
      message: profiles.length
        ? 'Ask the user which of these to open, then pass its name as `profile`.'
        : 'No Chrome profiles found on this machine.',
    });
  }

  if (args.action !== 'launch_app') {
    return JSON.stringify({
      success: false,
      error: `Unsupported action "${args.action}".`,
      actions: ['launch_app', 'list_apps', 'open_url', 'open_file', 'notify', 'list_profiles', 'set_default_profile'],
    });
  }

  const raw = args.app_name ?? '';
  ctx.progress(10, `Resolving "${raw}"…`);

  /* Chrome takes its own path: `start chrome` lets the shell decide which
     window to open, which is how it ends up in a guest profile. */
  if (/^(google\s*)?chrome$/i.test(raw.trim())) {
    const res = await openChrome({ profile: args.profile });
    if (!res.ok) {
      return JSON.stringify({ success: false, error: res.error, profiles: res.choices });
    }
    ctx.progress(100, 'Chrome opened.');
    return JSON.stringify({
      success: true,
      app: 'chrome',
      profile: res.profile?.name ?? null,
      profiles: res.choices,
      message: res.profile
        ? `Opened Chrome as ${res.profile.name}${res.profile.email ? ` (${res.profile.email})` : ''}.`
        : 'Opened Chrome. Ask which account to use, then pass it as `profile`.',
    });
  }

  const hit = resolve(raw);
  if (!hit) {
    // If not a pre-configured app launcher, attempt local file search & OS launch
    return openFileOrPath(raw, ctx);
  }

  ctx.progress(55, `Launching ${hit.key}…`);

  try {
    await execFileAsync(hit.target!.file, hit.target!.args, {
      // The two settings that make this safe. Do not change them.
      shell: false,
      windowsHide: true,
      timeout: 15_000,
      signal: ctx.signal,
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // `start` detaches, so a non-zero exit here usually means the app is
    // genuinely missing rather than that the launch failed.
    if (err.code === 'ENOENT') {
      return JSON.stringify({
        success: false,
        error: `${hit.key} is allow-listed but not installed on this machine.`,
      });
    }
    if (err.name === 'AbortError') {
      return JSON.stringify({ success: false, error: 'Cancelled before launch.' });
    }
    return JSON.stringify({ success: false, error: `Could not launch ${hit.key}: ${err.message}` });
  }

  ctx.progress(100, 'Launched.');
  return JSON.stringify({ success: true, message: `Launched ${hit.key}.`, app: hit.key });
}

export const DESKTOP_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['launch_app', 'list_apps', 'open_url', 'open_file', 'notify', 'list_profiles', 'set_default_profile'],
      description:
        'launch_app opens an installed application. open_file opens ANY file, document, image or directory by name or path (e.g. "report.pdf", "notes.txt"). If multiple files match a query, it reports the choices so you can ask the user which one to open. list_apps returns available apps. open_url opens a web address. notify shows a desktop notification.',
    },
    app_name: {
      type: 'string',
      description:
        `For launch_app or open_file. App name (e.g. "code", "chrome") or file/document name to open (e.g. "report.pdf").`,
    },
    file_path: {
      type: 'string',
      description: 'For open_file: the file name, document title, or path to open (e.g. "report.pdf" or "documents/notes.txt").',
    },
    url: {
      type: 'string',
      description: 'For open_url. An absolute http or https URL, e.g. https://github.com.',
    },
    browser: {
      type: 'string',
      description:
        'For open_url: which browser to open it in, e.g. "chrome". Omit to use the '
        + 'system default browser.',
    },
    title: { type: 'string', description: 'For notify. Short heading.' },
    message: { type: 'string', description: 'For notify. The notification body.' },
    profile: {
      type: 'string',
      description:
        'For launch_app on Chrome: which account to open, by display name or email. '
        + 'Get the list from list_profiles first.',
    },
  },
  required: ['action'],
} as const;

export const _internals = { resolve, ALLOWED, ALIASES };
