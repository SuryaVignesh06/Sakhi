import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

/**
 * Commands the machine can answer itself.
 *
 * "Set the volume to 50%" is not a reasoning problem. Routing it through a
 * model costs a network round trip, a planning call and a tool round to
 * arrive at an action that a regular expression could have identified
 * exactly — and it fails in the ways models fail: it can decide to explain
 * how to change the volume instead of changing it.
 *
 * So these run first, deterministically, and never reach the planner. The
 * bar for being in here is deliberately high: the phrasing has to be
 * unambiguous, and the action has to be one the machine can do directly. If
 * a request is anything less than certain, it falls through to the agents,
 * which is the behaviour that was there before.
 */

export interface LocalIntentResult {
  /** What to say back. Already phrased for the user. */
  text: string;
  /** Named so the transcript shows which capability ran. */
  intent: string;
}

/* ── Volume ────────────────────────────────────────────────────────────
   Windows exposes no command-line volume control, so this compiles a tiny
   COM wrapper around IAudioEndpointVolume on the fly. It is verbose, but it
   is the only way to set an ABSOLUTE level without shipping a helper binary;
   the SendKeys approach can only nudge up and down in fixed steps. */

const PS_VOLUME = `
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l();
  int SetMute(bool bMute, System.Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid id, int clsCtx, int act, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class Audio {
  static IAudioEndpointVolume Vol() {
    IMMDeviceEnumerator e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev; e.GetDefaultAudioEndpoint(0, 1, out dev);
    System.Guid g = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume aev; dev.Activate(ref g, 23, 0, out aev);
    return aev;
  }
  public static float Get() { float v; Vol().GetMasterVolumeLevelScalar(out v); return v * 100; }
  public static void Set(float p) { Vol().SetMasterVolumeLevelScalar(p / 100, System.Guid.Empty); }
  public static void Mute(bool m) { Vol().SetMute(m, System.Guid.Empty); }
}
'@
`;

async function ps(script: string): Promise<string> {
  const { stdout } = await run(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: 20_000, windowsHide: true }
  );
  return stdout.trim();
}

async function setVolume(percent: number): Promise<string> {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  if (IS_WIN) {
    await ps(`${PS_VOLUME}; [Audio]::Set(${p}); [Audio]::Mute($false)`);
  } else if (IS_MAC) {
    await run('osascript', ['-e', `set volume output volume ${p}`], { timeout: 10_000 });
  } else {
    await run('amixer', ['-D', 'pulse', 'sset', 'Master', `${p}%`], { timeout: 10_000 });
  }
  return `Volume set to ${p}%.`;
}

async function getVolume(): Promise<number> {
  if (IS_WIN) return Math.round(Number(await ps(`${PS_VOLUME}; [Audio]::Get()`)));
  if (IS_MAC) {
    return Math.round(Number(await run('osascript', ['-e', 'output volume of (get volume settings)'])
      .then((r) => r.stdout.trim())));
  }
  const { stdout } = await run('amixer', ['-D', 'pulse', 'sget', 'Master'], { timeout: 10_000 });
  return Number(stdout.match(/(\d+)%/)?.[1] ?? 0);
}

async function setMute(muted: boolean): Promise<string> {
  if (IS_WIN) await ps(`${PS_VOLUME}; [Audio]::Mute($${muted ? 'true' : 'false'})`);
  else if (IS_MAC) await run('osascript', ['-e', `set volume ${muted ? 'with' : 'without'} output muted`]);
  else await run('amixer', ['-D', 'pulse', 'set', 'Master', muted ? 'mute' : 'unmute']);
  return muted ? 'Muted.' : 'Unmuted.';
}

/* ── Matching ──────────────────────────────────────────────────────────
   Each rule states its own phrasing. Anything that does not match exactly
   falls through to the agents rather than being guessed at — a local
   shortcut that fires on the wrong sentence is worse than no shortcut. */

type Rule = { name: string; test: RegExp; run: (m: RegExpMatchArray) => Promise<string> };

const RULES: Rule[] = [
  {
    name: 'volume.set',
    /* "set/change/make the volume 50", "volume to 50 percent", "50% volume" */
    test: /\b(?:set|change|make|put|turn)?\s*(?:the\s+)?volume\s*(?:level\s*)?(?:to|at|=)?\s*(\d{1,3})\s*(?:%|percent)?\b/i,
    run: async (m) => setVolume(Number(m[1])),
  },
  {
    name: 'volume.relative',
    test: /\b(increase|decrease|raise|lower|turn\s+up|turn\s+down)\s+(?:the\s+)?volume(?:\s+(?:by\s+)?(\d{1,3})\s*(?:%|percent)?)?\b/i,
    run: async (m) => {
      const up = /increase|raise|up/i.test(m[1]);
      const step = m[2] ? Number(m[2]) : 10;
      const cur = await getVolume();
      return setVolume(up ? cur + step : cur - step);
    },
  },
  {
    name: 'volume.get',
    test: /\b(?:what(?:'s| is)?\s+(?:the\s+)?volume|how loud)\b/i,
    run: async () => `The volume is at ${await getVolume()}%.`,
  },
  {
    name: 'volume.mute',
    test: /\b(mute|unmute|silence)\b(?:\s+(?:the\s+)?(?:volume|sound|audio))?\s*$/i,
    run: async (m) => setMute(!/^un/i.test(m[1])),
  },
  {
    name: 'system.lock',
    test: /^\s*(?:please\s+)?lock\s+(?:the\s+)?(?:screen|computer|pc|laptop)\s*$/i,
    run: async () => {
      if (IS_WIN) await run('rundll32.exe', ['user32.dll,LockWorkStation'], { timeout: 10_000 });
      else if (IS_MAC) await run('pmset', ['displaysleepnow'], { timeout: 10_000 });
      else await run('loginctl', ['lock-session'], { timeout: 10_000 });
      return 'Locked.';
    },
  },
  {
    name: 'system.time',
    test: /^\s*(?:what(?:'s| is)?\s+(?:the\s+)?time|what time is it)\s*\??\s*$/i,
    run: async () =>
      `It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
  },
];

/**
 * Tries to answer without a model.
 *
 * Returns null when nothing matched, which is the normal case — the caller
 * then proceeds to the agents exactly as before.
 */
/**
 * Phrasings that describe an action rather than requesting it.
 *
 * "Write me a script that sets the volume to 50" matched the volume rule and
 * would have changed the volume instead of writing anything — the object of
 * the sentence is a script, not the speaker's audio. Anything framed as
 * write / explain / show / how-do-I belongs to the agents.
 */
const NOT_A_COMMAND =
  /\b(write|create|generate|make me|show me|explain|describe|how (?:do|would|can) (?:i|you)|what does|example|script|code|function|snippet|tutorial|why is|debug|fix)\b/i;

export async function tryLocalIntent(message: string): Promise<LocalIntentResult | null> {
  const text = message.trim();
  /* Long input is prose, not a command, however many keywords it contains. */
  if (!text || text.length > 120) return null;
  if (NOT_A_COMMAND.test(text)) return null;

  for (const rule of RULES) {
    const m = text.match(rule.test);
    if (!m) continue;
    try {
      return { text: await rule.run(m), intent: rule.name };
    } catch (e) {
      /* The machine refused. Say so rather than silently falling through to a
         model that will cheerfully claim it worked. */
      return {
        text: `I couldn't do that on this machine: ${(e as Error).message}`,
        intent: rule.name,
      };
    }
  }
  return null;
}

export const _internals = { RULES, getVolume, setVolume };
