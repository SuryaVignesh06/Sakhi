import { hub } from '../events/emitter.js';

export interface DiscoveryResult {
  url: string;
  title: string;
  snippet: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36';

function extractText(html: string): string {
  let s = html.replace(/<[^>]+>/g, ' ');
  return s.trim();
}

export async function discoverLinks(query: string, limit = 10): Promise<DiscoveryResult[]> {
  hub.emit('discovery_start', { query });

  try {
    const r = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ q: query }),
      signal: AbortSignal.timeout(15_000),
    });
    
    if (!r.ok) throw new Error(`Search returned ${r.status}`);
    const html = await r.text();

    const hits: DiscoveryResult[] = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;

    while ((m = re.exec(html)) && hits.length < limit) {
      let url = m[1];
      const wrapped = url.match(/[?&]uddg=([^&]+)/);
      if (wrapped) url = decodeURIComponent(wrapped[1]);
      if (!/^https?:/i.test(url)) continue;

      hits.push({ title: extractText(m[2]), url, snippet: '' });
    }

    const snips = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];
    hits.forEach((h, i) => {
      if (snips[i]) h.snippet = extractText(snips[i][1]).slice(0, 300);
    });

    hub.emit('discovery_complete', { query, candidate_count: hits.length });
    return hits;
  } catch (error) {
    hub.emit('discovery_complete', { query, candidate_count: 0 });
    return [];
  }
}
