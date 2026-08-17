import fs from 'fs/promises';
import path from 'path';

export interface Chunk {
  id: string;
  url: string;
  text: string;
  vector: number[];
}

const STORE_PATH = path.join(process.cwd(), '.data', 'rag_store.json');

let store: Chunk[] | null = null;

async function loadStore() {
  if (store) return store;
  try {
    const data = await fs.readFile(STORE_PATH, 'utf-8');
    store = JSON.parse(data);
  } catch {
    store = [];
  }
  return store!;
}

async function saveStore() {
  if (!store) return;
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store));
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function addChunks(chunks: Omit<Chunk, 'id'>[]) {
  const currentStore = await loadStore();
  const newChunks = chunks.map(c => ({
    ...c,
    id: crypto.randomUUID()
  }));
  currentStore.push(...newChunks);
  await saveStore();
}

export async function search(queryVector: number[], limit: number = 5): Promise<Chunk[]> {
  const currentStore = await loadStore();
  
  const scored = currentStore.map(chunk => ({
    chunk,
    score: cosineSimilarity(queryVector, chunk.vector)
  }));
  
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.chunk);
}

export async function getTotalChunks(): Promise<number> {
  const currentStore = await loadStore();
  return currentStore.length;
}

export async function getUniqueSources(): Promise<string[]> {
  const currentStore = await loadStore();
  const urls = new Set(currentStore.map(c => c.url));
  return Array.from(urls);
}
