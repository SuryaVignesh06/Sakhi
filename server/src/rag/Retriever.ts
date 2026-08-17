import { embedText } from './Embedder.js';
import { search, Chunk } from './LocalVectorStore.js';

export async function retrieveContext(query: string, limit: number = 5): Promise<Chunk[]> {
  const vector = await embedText(query);
  return await search(vector, limit);
}
