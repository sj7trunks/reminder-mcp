import { config } from '../config/index.js';

export const EMBEDDING_MODEL = config.embedding.model;

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export function isEmbeddingEnabled(): boolean {
  return config.database.type === 'postgres' && !!config.embedding.apiUrl;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const { apiUrl, apiKey, model, dimensions } = config.embedding;

  if (!apiUrl) {
    throw new Error('EMBEDDING_API_URL is not configured');
  }

  const response = await fetch(`${apiUrl}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ input: text, model, dimensions }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  return data.data[0]?.embedding ?? [];
}
