import { readFile, access } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
const IS_WIN = platform() === 'win32';
const IS_MAC = platform() === 'darwin';

/**
 * Chrome, launched into a real signed-in profile.
 *
 * `start chrome` — which is what the desktop tool used — hands the request to
 * the shell, which opens whatever window Chrome feels like: often a fresh
 * guest window with none of the user's accounts. That is the "it opened in a
 * guest account" problem.
 *
 * Chrome's own answer is `--profile-directory`, which takes the on-disk
 * folder name ("Default", "Profile 1", …) rather than the display name. The
 * mapping between the two lives in Chrome's `Local State` file, so this reads
 * that and offers the human-readable names — the agent can then ask which
 * account to use and launch straight into it.
 */

export interface ChromeProfile {
  /** The on-disk folder — what --profile-directory wants. */
  directory: string;
  /** What the user calls it. */
  name: string;
  /** The signed-in address, when there is one. */
  email?: string;
}

function userDataDir(): string {
  const home = homedir();
  if (IS_WIN) {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'),
      'Google', 'Chrome', 'User Data'
    );
  }
  if (IS_MAC) return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  return path.join(home, '.config', 'google-chrome');
}

/** Where Chrome actually is. Probed, because PATH rarely has it on Windows. */
async function chromeBinary(): Promise<string | null> {
  const candidates = IS_WIN
    ? [
        path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
        path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
      ]
    : IS_MAC
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/chromium'];

  for (const c of candidates) {
    if (!c) continue;
    try {
      await access(c);
      return c;
    } catch {
      /* not here */
    }
  }
  return null;
}

/**
 * The profiles Chrome knows about, newest-used first.
 *
 * `info_cache` is keyed by the directory name and carries the display name
 * and, for signed-in profiles, the account email. Profiles with no cache
 * entry are skipped rather than guessed at.
 */
export async function listProfiles(): Promise<ChromeProfile[]> {
  try {
    const raw = await readFile(path.join(userDataDir(), 'Local State'), 'utf8');
    const j = JSON.parse(raw);
    const cache = j?.profile?.info_cache ?? {};

    const out: ChromeProfile[] = Object.entries(cache).map(([dir, info]: [string, any]) => ({
      directory: dir,
      name: String(info?.name ?? dir),
      email: info?.user_name || undefined,
    }));

    // Signed-in profiles first — those are the ones a person means by "account".
    return out.sort((a, b) => Number(Boolean(b.email)) - Number(Boolean(a.email)));
  } catch {
    return [];
  }
}

/**
 * Open Chrome, optionally in a named profile and at a URL.
 *
 * `profile` accepts either the display name ("Surya") or the directory
 * ("Profile 1") — a model reading the list back will use whichever it saw.
 */
export async function openChrome(opts: { profile?: string; url?: string } = {}): Promise<{
  ok: boolean;
  profile?: ChromeProfile;
  error?: string;
  choices?: ChromeProfile[];
}> {
  const bin = await chromeBinary();
  if (!bin) return { ok: false, error: 'Google Chrome does not appear to be installed.' };

  const profiles = await listProfiles();
  let chosen: ChromeProfile | undefined;

  if (opts.profile) {
    const want = opts.profile.trim().toLowerCase();
    chosen =
      profiles.find((p) => p.directory.toLowerCase() === want) ??
      profiles.find((p) => p.name.toLowerCase() === want) ??
      profiles.find((p) => p.email?.toLowerCase() === want) ??
      // Partial match last, so "surya" finds "Surya Vignesh".
      profiles.find((p) => p.name.toLowerCase().includes(want));

    if (!chosen) {
      return {
        ok: false,
        error: `No Chrome profile matches "${opts.profile}".`,
        choices: profiles,
      };
    }
  }

  const args: string[] = [];
  /* Without this Chrome may open a guest or profile-picker window instead of
     the account the user asked for. */
  if (chosen) args.push(`--profile-directory=${chosen.directory}`);
  if (opts.url) args.push(opts.url);

  /* Detached: Chrome outlives this process, and awaiting it would block the
     turn for as long as the browser stays open. */
  const child = execFile(bin, args, { windowsHide: false });
  child.unref?.();

  return { ok: true, profile: chosen, choices: profiles };
}
