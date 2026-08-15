import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { FILES_ROOT } from './files.js';
import type { ToolContext } from './registry.js';

const execFileAsync = promisify(execFile);

/**
 * Read-only system inspection.
 *
 * "Terminal" is a generous name: this does NOT run arbitrary commands, and
 * deliberately cannot. The model picks a `command` from a fixed list; the
 * argv for it is written here, not by the model. So there is no command
 * string to escape, no shell to interpret metacharacters, and no way to
 * compose two commands.
 *
 * Every entry is read-only. A prompt injection that reaches this tool can
 * learn the machine's disk usage; it cannot change anything.
 *
 * Arbitrary execution is a legitimate feature to want, but it needs a
 * different design (an explicit per-command confirmation showing the exact
 * argv, and an opt-in the user turns on knowingly) — not a wider list here.
 */

interface Cmd {
  win32?: { file: string; args: string[] };
  darwin?: { file: string; args: string[] };
  linux?: { file: string; args: string[] };
  description: string;
}

const ps = (script: string) => ({
  file: 'powershell',
  args: ['-NoProfile', '-NonInteractive', '-Command', script],
});

const COMMANDS: Record<string, Cmd> = {
  date: {
    description: 'Current date and time.',
    win32: ps('Get-Date -Format "dddd, dd MMMM yyyy HH:mm:ss"'),
    darwin: { file: 'date', args: [] },
    linux: { file: 'date', args: [] },
  },
  whoami: {
    description: 'The logged-in user.',
    win32: { file: 'whoami', args: [] },
    darwin: { file: 'whoami', args: [] },
    linux: { file: 'whoami', args: [] },
  },
  hostname: {
    description: 'The machine name.',
    win32: { file: 'hostname', args: [] },
    darwin: { file: 'hostname', args: [] },
    linux: { file: 'hostname', args: [] },
  },
  disk_usage: {
    description: 'Free and total space per drive.',
    win32: ps(
      'Get-PSDrive -PSProvider FileSystem | ' +
        'Select-Object Name,@{n="UsedGB";e={[math]::Round($_.Used/1GB,1)}},' +
        '@{n="FreeGB";e={[math]::Round($_.Free/1GB,1)}} | Format-Table -AutoSize | Out-String'
    ),
    darwin: { file: 'df', args: ['-h'] },
    linux: { file: 'df', args: ['-h'] },
  },
  memory_usage: {
    description: 'RAM in use and available.',
    win32: ps(
      '$o = Get-CimInstance Win32_OperatingSystem; ' +
        '"Total: {0} GB, Free: {1} GB" -f ' +
        '[math]::Round($o.TotalVisibleMemorySize/1MB,1), [math]::Round($o.FreePhysicalMemory/1MB,1)'
    ),
    darwin: { file: 'vm_stat', args: [] },
    linux: { file: 'free', args: ['-h'] },
  },
  running_apps: {
    description: 'Applications with a visible window.',
    win32: ps(
      'Get-Process | Where-Object { $_.MainWindowTitle } | ' +
        'Select-Object -First 25 ProcessName,MainWindowTitle | Format-Table -AutoSize | Out-String'
    ),
    darwin: { file: 'osascript', args: ['-e', 'tell application "System Events" to get name of (processes where background only is false)'] },
    linux: { file: 'wmctrl', args: ['-l'] },
  },
  battery: {
    description: 'Battery charge level, on a laptop.',
    win32: ps('(Get-CimInstance Win32_Battery | Select-Object -First 1 -ExpandProperty EstimatedChargeRemaining) -as [string]'),
    darwin: { file: 'pmset', args: ['-g', 'batt'] },
    linux: { file: 'cat', args: ['/sys/class/power_supply/BAT0/capacity'] },
  },
  ip_address: {
    description: 'Local network addresses.',
    win32: ps('Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" } | Select-Object -ExpandProperty IPAddress'),
    darwin: { file: 'ipconfig', args: ['getifaddr', 'en0'] },
    linux: { file: 'hostname', args: ['-I'] },
  },
  workspace_size: {
    description: `Number of files in the workspace folder (${FILES_ROOT}).`,
    win32: ps(`(Get-ChildItem -LiteralPath '${FILES_ROOT.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count -as [string]`),
    darwin: { file: 'find', args: [FILES_ROOT, '-type', 'f'] },
    linux: { file: 'find', args: [FILES_ROOT, '-type', 'f'] },
  },
};

const MAX_OUTPUT = 4_000;

export function listCommands(): { name: string; description: string }[] {
  const p = process.platform as 'win32' | 'darwin' | 'linux';
  return Object.entries(COMMANDS)
    .filter(([, c]) => c[p])
    .map(([name, c]) => ({ name, description: c.description }));
}

export interface TerminalArgs {
  command: string;
}

export async function runTerminal(args: TerminalArgs, ctx: ToolContext): Promise<string> {
  const name = String(args.command ?? '').trim().toLowerCase();
  const entry = COMMANDS[name];
  const target = entry?.[process.platform as 'win32' | 'darwin' | 'linux'];

  if (!target) {
    return JSON.stringify({
      success: false,
      error: `"${args.command}" is not an available command. Only the listed read-only checks can run.`,
      available: listCommands().map((c) => c.name),
    });
  }

  ctx.progress(40, `Running ${name}…`);

  try {
    const { stdout, stderr } = await execFileAsync(target.file, target.args, {
      shell: false,
      windowsHide: true,
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
      signal: ctx.signal,
    });
    const out = (stdout || stderr || '').trim();
    ctx.progress(100, 'Done.');
    return JSON.stringify({
      success: true,
      command: name,
      output: out.slice(0, MAX_OUTPUT) || '(no output)',
      truncated: out.length > MAX_OUTPUT,
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return JSON.stringify({ success: false, error: `${name} is unavailable on this machine.` });
    }
    return JSON.stringify({ success: false, error: `${name} failed: ${err.message}` });
  }
}

export const TERMINAL_SCHEMA = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      enum: Object.keys(COMMANDS),
      description:
        'Which read-only system check to run. ' +
        listCommands().map((c) => `${c.name}: ${c.description}`).join(' '),
    },
  },
  required: ['command'],
} as const;
