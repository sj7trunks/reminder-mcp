import OpenAI from 'openai';
import { config } from '../config/index.js';

export const EMBEDDING_MODEL = 'text-embedding-3-small';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }

  return openaiClient;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0]?.embedding ?? [];
}
