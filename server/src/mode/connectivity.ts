import dns from 'dns/promises';

export type SystemMode = 'online' | 'offline';

export interface ModeStatus {
  mode: SystemMode;
  reason?: string;
}

export async function determineMode(): Promise<ModeStatus> {
  try {
    // Basic internet check: can we resolve a highly available host?
    await dns.lookup('1.1.1.1');
  } catch {
    return { mode: 'offline', reason: 'no_internet' };
  }

  try {
    // Check if Gemini or OpenRouter endpoints are reachable via DNS
    await Promise.any([
      dns.lookup('generativelanguage.googleapis.com'),
      dns.lookup('openrouter.ai')
    ]);
    return { mode: 'online' };
  } catch {
    return { mode: 'offline', reason: 'provider_unreachable' };
  }
}
