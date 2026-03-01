import Queue from 'bull';
import pgvector from 'pgvector';
import { config } from '../config/index.js';
import { db } from '../db/index.js';
import { EMBEDDING_MODEL, isEmbeddingEnabled, generateEmbedding } from './embedding.js';

interface EmbeddingJobData {
  memoryId: string;
  content: string;
}

const MAX_ATTEMPTS = 5;
const BACKOFF_DELAY_MS = 60_000;

let queue: Queue.Queue<EmbeddingJobData> | null = null;
let isWorkerStarted = false;

function canUseQueue(): boolean {
  return isEmbeddingEnabled() && Boolean(config.redis.url);
}

function getQueue(): Queue.Queue<EmbeddingJobData> | null {
  if (!canUseQueue()) {
    return null;
  }

  if (!queue) {
    queue = new Queue<EmbeddingJobData>('embeddings', config.redis.url!);
  }

  return queue;
}

export async function processMemoryEmbedding(memoryId: string, content: string): Promise<void> {
  const embedding = await generateEmbedding(content);

  await db('memories')
    .where('id', memoryId)
    .update({
      embedding: pgvector.toSql(embedding),
      embedding_status: 'completed',
      embedding_model: EMBEDDING_MODEL,
      embedding_error: null,
    });
}

export async function enqueueEmbeddingJob(memoryId: string, content: string): Promise<boolean> {
  if (!isEmbeddingEnabled()) {
    return false;
  }

  const embeddingQueue = getQueue();
  if (embeddingQueue) {
    await embeddingQueue.add(
      { memoryId, content },
      {
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      }
    );
    return true;
  }

  // No Redis — process synchronously in background
  processMemoryEmbedding(memoryId, content).catch((err) => {
    console.error(`[Embedding] Sync processing failed for ${memoryId}:`, err);
    db('memories').where('id', memoryId).update({
      embedding_status: 'failed',
      embedding_error: err instanceof Error ? err.message : 'Unknown error',
    }).catch(() => {});
  });
  return true;
}

export function startEmbeddingWorker(): void {
  if (isWorkerStarted) {
    return;
  }

  const embeddingQueue = getQueue();
  if (!embeddingQueue) {
    if (isEmbeddingEnabled()) {
      console.log('Embedding queue disabled (no REDIS_URL). Embeddings will be processed synchronously.');
    }
    return;
  }

  embeddingQueue.process(async (job) => {
    await processMemoryEmbedding(job.data.memoryId, job.data.content);
  });

  embeddingQueue.on('failed', async (job, err) => {
    if (!job) return;

    if (job.attemptsMade >= MAX_ATTEMPTS) {
      console.error(`Embedding failed for memory ${job.data.memoryId}: ${err.message}`);
      await db('memories')
        .where('id', job.data.memoryId)
        .update({
          embedding_status: 'failed',
          embedding_error: err.message,
        });
    }
  });

  isWorkerStarted = true;
}

export async function stopEmbeddingWorker(): Promise<void> {
  if (!queue) {
    return;
  }

  await queue.close();
  queue = null;
  isWorkerStarted = false;
}
