import { pipeline } from '@huggingface/transformers';

let embedder: any = null;

export async function getEmbedder() {
  if (!embedder) {
    // using a lightweight feature extraction model suitable for fast local execution
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'cpu',
      dtype: 'q8', // quantized for speed
    });
  }
  return embedder;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
