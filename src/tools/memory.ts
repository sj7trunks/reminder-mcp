import { z } from 'zod';
import pgvector from 'pgvector';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import type { Memory } from '../db/models/Memory.js';
import { generateEmbedding } from '../services/embedding.js';
import { enqueueEmbeddingJob } from '../services/embedding-worker.js';

export const RememberSchema = z.object({
  user_id: z.string(),
  content: z.string().min(1).describe('What to remember'),
  tags: z.array(z.string()).optional().default([]).describe('Optional tags for categorization'),
});

export const RecallSchema = z.object({
  user_id: z.string(),
  query: z.string().optional().describe('Optional search query to filter memories'),
  tags: z.array(z.string()).optional().describe('Filter by tags'),
  embedding_status: z.enum(['pending', 'completed', 'failed']).optional().describe('Optional embedding status filter'),
  limit: z.number().optional().default(50).describe('Maximum number of results'),
});

export const ForgetSchema = z.object({
  memory_id: z.string().uuid().describe('Memory ID to forget'),
});

export async function remember(input: z.infer<typeof RememberSchema>): Promise<{ success: boolean; memory?: Memory; error?: string }> {
  const id = uuid();
  const now = new Date();
  const tags = input.tags ?? [];
  const embeddingStatus = config.database.type === 'postgres' ? 'pending' : null;

  const memory: Memory = {
    id,
    user_id: input.user_id,
    content: input.content,
    tags: tags,
    recalled_count: 0,
    embedding_status: embeddingStatus,
    embedding_model: null,
    embedding_error: null,
    created_at: now,
  };

  await db('memories').insert({
    ...memory,
    tags: JSON.stringify(tags),
    created_at: now.toISOString(),
  });

  if (config.database.type === 'postgres') {
    const enqueued = await enqueueEmbeddingJob(id, input.content);
    if (!enqueued) {
      await db('memories').where('id', id).update({
        embedding_status: 'failed',
        embedding_error: 'Embedding queue unavailable (requires REDIS_URL and OPENAI_API_KEY)',
      });
      memory.embedding_status = 'failed';
      memory.embedding_error = 'Embedding queue unavailable (requires REDIS_URL and OPENAI_API_KEY)';
    }
  }

  // Log activity
  await db('activities').insert({
    id: uuid(),
    user_id: input.user_id,
    type: 'memory',
    action: 'created',
    entity_id: id,
    metadata: JSON.stringify({ content: input.content.substring(0, 100), tags: tags }),
    created_at: now.toISOString(),
  });

  return { success: true, memory };
}

function parseTags(rowTags: unknown): string[] {
  if (Array.isArray(rowTags)) {
    return rowTags.filter((tag): tag is string => typeof tag === 'string');
  }

  if (typeof rowTags === 'string') {
    try {
      const parsed = JSON.parse(rowTags);
      if (Array.isArray(parsed)) {
        return parsed.filter((tag): tag is string => typeof tag === 'string');
      }
    } catch {
      return [];
    }
  }

  return [];
}

function mapMemoryRow(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    content: row.content as string,
    tags: parseTags(row.tags),
    recalled_count: Number(row.recalled_count || 0),
    embedding_status: (row.embedding_status as Memory['embedding_status']) ?? null,
    embedding_model: (row.embedding_model as string | null) ?? null,
    embedding_error: (row.embedding_error as string | null) ?? null,
    created_at: new Date(row.created_at as string),
  };
}

async function recallPostgresHybrid(input: z.infer<typeof RecallSchema>, limit: number): Promise<Record<string, unknown>[]> {
  if (!input.query) {
    let query = db('memories').where('user_id', input.user_id);
    if (input.embedding_status) {
      query = query.andWhere('embedding_status', input.embedding_status);
    }
    return query.orderBy('created_at', 'desc').limit(limit);
  }

  try {
    const queryEmbedding = await generateEmbedding(input.query);
    const embeddingSql = pgvector.toSql(queryEmbedding);

    const bindings: unknown[] = [embeddingSql, input.query, input.query, input.user_id];
    let embeddingFilterSql = '';
    if (input.embedding_status) {
      embeddingFilterSql = ' AND m.embedding_status = ? ';
      bindings.push(input.embedding_status);
    }
    bindings.push(limit);

    const raw = await db.raw(`
      WITH query_embedding AS (
        SELECT ?::vector(1536) AS embedding
      )
      SELECT
        m.*,
        CASE
          WHEN m.embedding IS NOT NULL THEN
            (1 - (m.embedding <=> (SELECT embedding FROM query_embedding))) * 0.7 +
            COALESCE(ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', ?)), 0) * 0.3
          ELSE
            COALESCE(ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', ?)), 0) * 0.3
        END AS hybrid_score
      FROM memories m
      WHERE m.user_id = ?
      ${embeddingFilterSql}
      ORDER BY hybrid_score DESC, m.created_at DESC
      LIMIT ?
    `, bindings);

    return raw.rows as Record<string, unknown>[];
  } catch (error) {
    console.error('Hybrid search fallback to keyword search:', error);
    let query = db('memories')
      .where('user_id', input.user_id)
      .andWhere('content', 'like', `%${input.query}%`);

    if (input.embedding_status) {
      query = query.andWhere('embedding_status', input.embedding_status);
    }
    return query.orderBy('created_at', 'desc').limit(limit);
  }
}

export async function recall(input: z.infer<typeof RecallSchema>): Promise<{ memories: Memory[] }> {
  const limit = input.limit ?? 50;
  const isPostgres = config.database.type === 'postgres';

  let rows: Record<string, unknown>[] = [];

  if (isPostgres) {
    rows = await recallPostgresHybrid(input, limit);
  } else {
    let query = db('memories').where('user_id', input.user_id);

    if (input.query) {
      query = query.andWhere('content', 'like', `%${input.query}%`);
    }

    if (input.embedding_status) {
      query = query.andWhere('embedding_status', input.embedding_status);
    }

    rows = await query.orderBy('created_at', 'desc').limit(limit);
  }

  // Filter by tags if provided (done in memory since SQLite JSON support is limited)
  let memories: Memory[] = rows.map(mapMemoryRow);

  if (input.tags && input.tags.length > 0) {
    memories = memories.filter((m) =>
      input.tags!.some((tag) => m.tags.includes(tag))
    );
  }

  // Increment recalled_count for all returned memories
  const memoryIds = memories.map((m) => m.id);
  if (memoryIds.length > 0) {
    await db('memories')
      .whereIn('id', memoryIds)
      .increment('recalled_count', 1);

    // Update local objects
    memories = memories.map((m) => ({ ...m, recalled_count: m.recalled_count + 1 }));

    // Log activity
    const now = new Date();
    for (const memory of memories) {
      await db('activities').insert({
        id: uuid(),
        user_id: memory.user_id,
        type: 'memory',
        action: 'recalled',
        entity_id: memory.id,
        metadata: JSON.stringify({ query: input.query }),
        created_at: now.toISOString(),
      });
    }
  }

  return { memories };
}

export async function forget(input: z.infer<typeof ForgetSchema> & { user_id: string }): Promise<{ success: boolean; error?: string }> {
  const memory = await db('memories')
    .where('id', input.memory_id)
    .where('user_id', input.user_id)
    .first();

  if (!memory) {
    return { success: false, error: 'Memory not found' };
  }

  await db('memories').where('id', input.memory_id).delete();

  // Log activity
  const now = new Date();
  await db('activities').insert({
    id: uuid(),
    user_id: input.user_id,
    type: 'memory',
    action: 'deleted',
    entity_id: input.memory_id,
    metadata: JSON.stringify({ content: memory.content.substring(0, 100) }),
    created_at: now.toISOString(),
  });

  return { success: true };
}
