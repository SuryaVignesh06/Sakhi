import { execFile } from 'node:child_process';
import type { ToolContext } from './registry.js';

/**
 * System clipboard access.
 *
 * Writing goes through the child process's STDIN rather than an argument or an
 * interpolated script. That is the whole trick: text the model produced never
 * becomes part of a command line, so no quoting bug can turn a paragraph into
 * an instruction. It also removes the OS argument-length limit, which a code
 * snippet would otherwise hit.
 */

const READ: Record<string, { file: string; args: string[] }> = {
  win32: { file: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard -Raw'] },
  darwin: { file: 'pbpaste', args: [] },
  linux: { file: 'xclip', args: ['-selection', 'clipboard', '-o'] },
};

const WRITE: Record<string, { file: string; args: string[] }> = {
  // `clip` reads stdin and needs no escaping at all.
  win32: { file: 'clip', args: [] },
  darwin: { file: 'pbcopy', args: [] },
  linux: { file: 'xclip', args: ['-selection', 'clipboard'] },
};

/** Beyond this the payload is almost certainly a mistake, not a copy. */
const MAX_WRITE = 100_000;
/** Truncated on read so a huge clipboard cannot blow the model's context. */
const MAX_READ = 8_000;

function run(
  file: string,
  args: string[],
  stdin: string | null,
  signal: AbortSignal
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { shell: false, windowsHide: true, timeout: 10_000, signal, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => (err ? reject(err) : resolve({ stdout, stderr }))
    );
    if (stdin !== null) {
      child.stdin?.end(stdin);
    }
  });
}

export interface ClipboardArgs {
  action: 'read' | 'write';
  text?: string;
}

export async function runClipboard(args: ClipboardArgs, ctx: ToolContext): Promise<string> {
  const platform = process.platform;

  if (args.action === 'read') {
    const cmd = READ[platform];
    if (!cmd) return JSON.stringify({ success: false, error: `Clipboard read is unsupported on ${platform}.` });

    ctx.progress(40, 'Reading clipboard…');
    try {
      const { stdout } = await run(cmd.file, cmd.args, null, ctx.signal);
      const text = stdout.replace(/\r\n/g, '\n').replace(/\n$/, '');
      ctx.progress(100, 'Read.');
      return JSON.stringify({
        success: true,
        text: text.slice(0, MAX_READ),
        truncated: text.length > MAX_READ,
        length: text.length,
      });
    } catch (e) {
      const msg = (e as Error).message;
      return JSON.stringify({
        success: false,
        error:
          platform === 'linux' && /ENOENT/.test(msg)
            ? 'xclip is not installed, so the clipboard cannot be read.'
            : `Could not read the clipboard: ${msg}`,
      });
    }
  }

  if (args.action !== 'write') {
    return JSON.stringify({ success: false, error: `Unsupported action "${args.action}".`, actions: ['read', 'write'] });
  }

  const text = String(args.text ?? '');
  if (!text) return JSON.stringify({ success: false, error: 'A non-empty "text" is required to write.' });
  if (text.length > MAX_WRITE) {
    return JSON.stringify({ success: false, error: `Text is ${text.length} characters; the limit is ${MAX_WRITE}.` });
  }

  const cmd = WRITE[platform];
  if (!cmd) return JSON.stringify({ success: false, error: `Clipboard write is unsupported on ${platform}.` });

  ctx.progress(40, 'Writing to clipboard…');
  try {
    await run(cmd.file, cmd.args, text, ctx.signal);
  } catch (e) {
    return JSON.stringify({ success: false, error: `Could not write to the clipboard: ${(e as Error).message}` });
  }

  ctx.progress(100, 'Copied.');
  return JSON.stringify({ success: true, message: `Copied ${text.length} characters to the clipboard.` });
}

export const CLIPBOARD_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['read', 'write'],
      description: 'read returns the current clipboard contents. write replaces them.',
    },
    text: { type: 'string', description: 'For write. The text to place on the clipboard.' },
  },
  required: ['action'],
} as const;
