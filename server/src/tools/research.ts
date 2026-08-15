import type { ToolContext } from './registry.js';

/**
 * Web research: search, fetch, and extract readable text.
 *
 * Distinct from the `browser` tool, which drives a real visible browser for
 * the user to watch. This one is headless and silent — it is for answering a
 * question from the open web, not for automating a click. It fetches pages,
 * strips them to prose, and hands back text the model can reason over.
 *
 * No API key and no third-party SDK: DuckDuckGo's HTML endpoint answers
 * without credentials, which keeps this working on a fresh clone.
 */

export interface ResearchArgs {
  action: 'search' | 'read' | 'deep';
  query?: string;
  url?: string;
  /** How many results to open for `deep`. */
  depth?: number;
}

/** Pages are truncated; a whole site would swamp the context window. */
const MAX_CHARS = 12_000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36';

/**
 * HTML → readable text.
 *
 * Script, style, nav and footer content is dropped first: leaving it in means
 * the model reads cookie banners and menu items as though they were the
 * article. What remains is de-tagged, entity-decoded, and collapsed.
 */
function extract(html: string): string {
  let s = html;
  s = s.replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<(nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Block-level tags become newlines so paragraphs survive as paragraphs.
  s = s.replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  s = s.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n');
  return s.trim();
}

function titleOf(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? extract(m[1]).slice(0, 200) : '';
}

async function fetchPage(url: string): Promise<{ title: string; text: string; url: string }> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);

  const type = r.headers.get('content-type') ?? '';
  const body = await r.text();

  // Plain text and JSON need no stripping and would be mangled by it.
  if (!/html/i.test(type)) {
    return { url, title: url, text: body.slice(0, MAX_CHARS) };
  }
  return { url, title: titleOf(body), text: extract(body).slice(0, MAX_CHARS) };
}

export interface SearchHit { title: string; url: string; snippet: string }

/**
 * DuckDuckGo's no-JavaScript endpoint. Its markup is stable and it needs no
 * key — the trade-off is that results must be scraped rather than parsed from
 * JSON, so the patterns below are tied to that page's shape.
 */
async function search(query: string, limit = 8): Promise<SearchHit[]> {
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

  const hits: SearchHit[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) && hits.length < limit) {
    let url = m[1];
    // Results are wrapped in a redirect; the real target is the uddg param.
    const wrapped = url.match(/[?&]uddg=([^&]+)/);
    if (wrapped) url = decodeURIComponent(wrapped[1]);
    if (!/^https?:/i.test(url)) continue;

    hits.push({ title: extract(m[2]), url, snippet: '' });
  }

  // Snippets are in a parallel list; pairing by index is what the markup allows.
  const snips = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];
  hits.forEach((h, i) => {
    if (snips[i]) h.snippet = extract(snips[i][1]).slice(0, 300);
  });

  return hits;
}

export async function runResearch(args: ResearchArgs, ctx: ToolContext): Promise<string> {
  try {
    if (args.action === 'read') {
      const url = String(args.url ?? '').trim();
      if (!url) return JSON.stringify({ success: false, error: 'A "url" is required to read.' });
      ctx.progress(40, `Reading ${url}…`);
      const page = await fetchPage(url);
      ctx.progress(100, 'Read.');
      return JSON.stringify({ success: true, ...page });
    }

    const query = String(args.query ?? '').trim();
    if (!query) return JSON.stringify({ success: false, error: 'A "query" is required.' });

    ctx.progress(20, `Searching for "${query}"…`);
    const hits = await search(query);
    if (!hits.length) {
      return JSON.stringify({ success: true, query, results: [], note: 'No results found.' });
    }

    if (args.action === 'search') {
      ctx.progress(100, `${hits.length} results.`);
      return JSON.stringify({ success: true, query, results: hits });
    }

    /* deep: open the top results and return their text. Fetched in parallel —
       the pages are independent, and serially this takes as long as the
       slowest site multiplied by the count. */
    const depth = Math.max(1, Math.min(5, args.depth ?? 3));
    const chosen = hits.slice(0, depth);
    ctx.progress(50, `Reading ${chosen.length} pages…`);

    const pages = await Promise.all(
      chosen.map((h) =>
        fetchPage(h.url).catch((e) => ({
          url: h.url,
          title: h.title,
          text: `(could not be read: ${(e as Error).message})`,
        }))
      )
    );

    ctx.progress(100, 'Done.');
    return JSON.stringify({ success: true, query, results: hits, pages });
  } catch (e) {
    return JSON.stringify({ success: false, error: (e as Error).message });
  }
}

export const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['search', 'read', 'deep'],
      description:
        'search returns result titles, links and snippets. read fetches one URL and returns its ' +
        'readable text. deep searches and then reads the top pages — use it when the user wants ' +
        'an answer researched from the web rather than a list of links.',
    },
    query: { type: 'string', description: 'What to search for. Required for search and deep.' },
    url: { type: 'string', description: 'The page to read. Required for read.' },
    depth: {
      type: 'integer',
      description: 'For deep: how many of the top results to open. 1-5, default 3.',
    },
  },
  required: ['action'],
} as const;
