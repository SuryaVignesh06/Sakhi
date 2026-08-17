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
/* Connection credentials live in their own file rather than alongside the
   provider keys: they are keyed by free-form names, not the fixed ProviderId
   union, and keeping them separate means a corrupt connections vault cannot
   cost the user their model API keys. */
const SECRETS = path.join(DIR, 'secrets.vault');

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

/* ─── Connection secrets ──────────────────────────────────────────────
   The tokens an app connection needs (a GitHub PAT, a Slack bot token).
   Same AES-256-GCM-at-rest treatment and the same honest threat model as the
   provider keys above: this keeps them out of the plaintext connections file
   and out of anything that gets committed, not out of the hands of code
   already running as this user.

   These are handed to a child process as environment variables at spawn time
   and are never returned by any route — only a masked form is. */

type SecretBag = Record<string, string>;
let secretCache: SecretBag | null = null;

function readSecrets(): SecretBag {
  if (secretCache) return secretCache;
  try {
    if (!fs.existsSync(SECRETS)) return (secretCache = {});
    const raw = fs.readFileSync(SECRETS);
    const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return (secretCache = JSON.parse(
      Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
    ));
  } catch (err) {
    console.warn('[keystore] secrets vault unreadable, starting empty:', (err as Error).message);
    return (secretCache = {});
  }
}

function writeSecrets(v: SecretBag) {
  ensureDir();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(v), 'utf8'), c.final()]);
  fs.writeFileSync(SECRETS, Buffer.concat([iv, c.getAuthTag(), body]), { mode: 0o600 });
  secretCache = v;
}

export function setSecret(name: string, value: string) {
  const v = { ...readSecrets() };
  if (value.trim()) v[name] = value.trim();
  else delete v[name];
  writeSecrets(v);
}

export function getSecret(name: string): string | undefined {
  /* Env wins, so a machine can inject a token without it ever being written. */
  return process.env[name] || readSecrets()[name] || undefined;
}

export function hasSecret(name: string): boolean {
  return Boolean(getSecret(name));
}

export function deleteSecrets(names: string[]) {
  const v = { ...readSecrets() };
  let touched = false;
  for (const n of names) {
    if (n in v) {
      delete v[n];
      touched = true;
    }
  }
  if (touched) writeSecrets(v);
}

/** Safe for API responses and logs. */
export function maskSecret(name: string): string | null {
  const s = getSecret(name);
  if (!s) return null;
  return s.length <= 10 ? '••••' : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function listKeyStatus(): Record<string, { configured: boolean; masked: string | null; fromEnv: boolean }> {
  const out: Record<string, { configured: boolean; masked: string | null; fromEnv: boolean }> = {};
  for (const p of Object.keys(ENV_VAR) as ProviderId[]) {
    out[p] = { configured: hasKey(p), masked: maskKey(p), fromEnv: Boolean(process.env[ENV_VAR[p]]) };
  }
  return out;
}
