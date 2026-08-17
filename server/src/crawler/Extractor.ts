import axios from 'axios';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
export interface ExtractedPage {
  url: string;
  domain: string;
  title: string;
  textContent: string;
  links: string[];
}

export function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export async function fetchAndExtract(url: string): Promise<ExtractedPage> {
  const domain = new URL(url).hostname;
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 10000
  });

  const html = response.data;
  const $ = cheerio.load(html);
  
  // Extract all outbound links from the page
  const outboundLinks: string[] = [];
  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href');
      if (href) {
        const fullUrl = new URL(href, url).href;
        if (fullUrl.startsWith('http')) {
          outboundLinks.push(fullUrl);
        }
      }
    } catch {
      // ignore invalid URLs
    }
  });

  // Use Readability to extract clean text
  const doc = new JSDOM(html, { url });
  const reader = new Readability(doc.window.document);
  const article = reader.parse();

  return {
    url,
    domain,
    title: article?.title || $('title').text() || url,
    textContent: article?.textContent || $('body').text() || '',
    links: Array.from(new Set(outboundLinks))
  };
}

export function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
  }
  
  return chunks;
}
