
import { discoverLinks } from './Discovery.js';
import { fetchAndExtract, getFaviconUrl, chunkText } from './Extractor.js';
import { addChunks, getUniqueSources } from '../rag/LocalVectorStore.js';
import { embedText } from '../rag/Embedder.js';
import { hub } from '../events/emitter.js';
import crypto from 'crypto';

export interface CrawlOptions {
  query: string;
  maxSources?: number;
  maxHops?: number;
}

export async function runAgenticCrawl(options: CrawlOptions) {
  const maxSources = options.maxSources || 5;
  const maxHops = options.maxHops || 2;
  const query = options.query;

  let totalSourcesAdded = 0;
  let totalHops = 0;

  const visitedUrls = new Set<string>(await getUniqueSources());
  const linkQueue: { url: string; depth: number }[] = [];

  // Step 1: Discover initial candidates
  const candidates = await discoverLinks(query);
  for (const c of candidates) {
    if (!visitedUrls.has(c.url)) {
      linkQueue.push({ url: c.url, depth: 0 });
    }
  }

  // Step 2: Agentic loop
  const MAX_CONCURRENT = 3;

  while (linkQueue.length > 0 && totalSourcesAdded < maxSources) {
    const batch = [];
    while (linkQueue.length > 0 && batch.length < MAX_CONCURRENT && totalSourcesAdded + batch.length < maxSources) {
      const current = linkQueue.shift()!;
      if (visitedUrls.has(current.url)) continue;
      visitedUrls.add(current.url); // Mark visited immediately
      batch.push(current);
    }

    if (batch.length === 0) break;

    await Promise.all(batch.map(async (current) => {
      totalHops++;

      const domain = new URL(current.url).hostname;
      const faviconUrl = getFaviconUrl(domain);
      const sourceId = crypto.randomUUID();

      hub.emit('frontier_select', {
        url: current.url,
        domain,
        reason: 'Agentic selection from candidate pool',
        reasoning_provider: 'gemini',
        source: current.depth === 0 ? 'candidate_pool' : 'discovered_link',
        depth: current.depth
      });

      hub.emit('source_fetch_start', {
        id: sourceId,
        url: current.url,
        domain,
        favicon_url: faviconUrl
      });

      try {
        const page = await fetchAndExtract(current.url);

        hub.emit('source_fetch_complete', {
          id: sourceId,
          url: current.url,
          domain,
          favicon_url: faviconUrl,
          success: true
        });

        // RAG ingestion - Embed chunks concurrently
        hub.emit('embedding_start', {});
        const chunks = chunkText(page.title + "\n\n" + page.textContent);
        
        const vectorChunks = await Promise.all(chunks.map(async (text) => {
          const vector = await embedText(text);
          return { url: current.url, text, vector };
        }));

        await addChunks(vectorChunks);
        totalSourcesAdded++;
        hub.emit('embedding_complete', { chunk_count: chunks.length });
        hub.emit('rag_indexed', { chunk_count: chunks.length });

        // If we haven't reached max depth, consider outbound links
        if (current.depth < maxHops) {
          const newLinks = page.links.slice(0, 5).filter(l => !visitedUrls.has(l));
          
          for (const link of newLinks) {
             linkQueue.push({ url: link, depth: current.depth + 1 });
          }
        }

      } catch (e) {
        console.error(`Failed to fetch ${current.url}`, e);
        hub.emit('source_fetch_complete', {
          id: sourceId,
          url: current.url,
          domain,
          favicon_url: faviconUrl,
          success: false
        });
      }
    }));
  }

  hub.emit('search_trace_complete', {
    total_sources: totalSourcesAdded,
    total_hops: totalHops
  });
}
