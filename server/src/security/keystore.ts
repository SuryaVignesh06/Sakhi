import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ProviderId } from '../providers/types.js';

/**
 * Encrypted key storage — AES-256-GCM at rest.
 *
 * The master key is derived from a machine-bound seed kept in a 0600 file
 * beside the vault. Being honest about the threat model: this protects keys
 * from casual disk inspection, backups, and log leakage. It does NOT protect
 * against an attacker already running code as this user, because that process
 * can read the seed. Real protection needs the OS keychain (Electron
 * safeStorage / libsecret / DPAPI), which is the intended upgrade path.
 *
 * Plaintext keys never touch disk and are never logged or returned by any
 * route — only a masked form is exposed.
 */

const DIR = path.join(process.cwd(), '.data');
const VAULT = path.join(DIR, 'keys.vault');
const SEED = path.join(DIR, '.seed');

type Vault = Partial<Record<ProviderId, string>>;

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
}

function masterKey(): Buffer {
  ensureDir();
  let seed: Buffer;
  if (fs.existsSync(SEED)) {
    seed = fs.readFileSync(SEED);
  } else {
    seed = crypto.randomBytes(32);
    fs.writeFileSync(SEED, seed, { mode: 0o600 });
  }
  // Bind to the host so a copied vault does not decrypt elsewhere.
  const salt = `${os.hostname()}:${os.userInfo().username}`;
  return crypto.scryptSync(seed, salt, 32);
}

let cache: Vault | null = null;

function read(): Vault {
  if (cache) return cache;
  try {
    if (!fs.existsSync(VAULT)) return (cache = {});
    const raw = fs.readFileSync(VAULT);
    // layout: iv(12) | authTag(16) | ciphertext
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), iv);
    d.setAuthTag(tag);
    const json = Buffer.concat([d.update(body), d.final()]).toString('utf8');
    return (cache = JSON.parse(json));
  } catch (err) {
    // A corrupt or foreign vault must not crash startup — start empty and say so.
    console.warn('[keystore] vault unreadable, starting empty:', (err as Error).message);
    return (cache = {});
  }
}

function write(v: Vault) {
  ensureDir();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(v), 'utf8'), c.final()]);
  fs.writeFileSync(VAULT, Buffer.concat([iv, c.getAuthTag(), body]), { mode: 0o600 });
  cache = v;
}

/** Env wins over the vault, so a deployment can inject keys without writing them. */
const ENV_VAR: Record<ProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  ollama: 'OLLAMA_API_KEY',
  lmstudio: 'LMSTUDIO_API_KEY',
};

export function getKey(p: ProviderId): string | undefined {
  return process.env[ENV_VAR[p]] || read()[p] || undefined;
}

export function setKey(p: ProviderId, key: string) {
  const v = { ...read() };
  if (key.trim()) v[p] = key.trim();
  else delete v[p];
  write(v);
}

export function hasKey(p: ProviderId): boolean {
  return Boolean(getKey(p));
}

/** Safe for API responses and logs. */
export function maskKey(p: ProviderId): string | null {
  const k = getKey(p);
  if (!k) return null;
  return k.length <= 10 ? '••••' : `${k.slice(0, 6)}…${k.slice(-4)}`;
}

export function listKeyStatus(): Record<string, { configured: boolean; masked: string | null; fromEnv: boolean }> {
  const out: Record<string, { configured: boolean; masked: string | null; fromEnv: boolean }> = {};
  for (const p of Object.keys(ENV_VAR) as ProviderId[]) {
    out[p] = { configured: hasKey(p), masked: maskKey(p), fromEnv: Boolean(process.env[ENV_VAR[p]]) };
  }
  return out;
}
