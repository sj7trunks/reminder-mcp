import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import type { Memory } from '../db/models/Memory.js';

export const RememberSchema = z.object({
  user_id: z.string().describe('User identifier'),
  content: z.string().min(1).describe('What to remember'),
  tags: z.array(z.string()).optional().default([]).describe('Optional tags for categorization'),
});

export const RecallSchema = z.object({
  user_id: z.string().describe('User identifier'),
  query: z.string().optional().describe('Optional search query to filter memories'),
  tags: z.array(z.string()).optional().describe('Filter by tags'),
  limit: z.number().optional().default(50).describe('Maximum number of results'),
});

export const ForgetSchema = z.object({
  memory_id: z.string().uuid().describe('Memory ID to forget'),
});

export async function remember(input: z.infer<typeof RememberSchema>): Promise<{ success: boolean; memory?: Memory; error?: string }> {
  const id = uuid();
  const now = new Date();
  const tags = input.tags ?? [];

  const memory: Memory = {
    id,
    user_id: input.user_id,
    content: input.content,
    tags: tags,
    recalled_count: 0,
    created_at: now,
  };

  await db('memories').insert({
    ...memory,
    tags: JSON.stringify(tags),
    created_at: now.toISOString(),
  });

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

export async function recall(input: z.infer<typeof RecallSchema>): Promise<{ memories: Memory[] }> {
  const limit = input.limit ?? 50;

  let query = db('memories').where('user_id', input.user_id);

  // Simple text search if query provided
  if (input.query) {
    query = query.where('content', 'like', `%${input.query}%`);
  }

  const rows = await query.orderBy('created_at', 'desc').limit(limit);

  // Filter by tags if provided (done in memory since SQLite JSON support is limited)
  let memories: Memory[] = rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    content: row.content as string,
    tags: JSON.parse((row.tags as string) || '[]'),
    recalled_count: row.recalled_count as number,
    created_at: new Date(row.created_at as string),
  }));

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

export async function forget(input: z.infer<typeof ForgetSchema>): Promise<{ success: boolean; error?: string }> {
  const memory = await db('memories').where('id', input.memory_id).first();

  if (!memory) {
    return { success: false, error: 'Memory not found' };
  }

  await db('memories').where('id', input.memory_id).delete();

  // Log activity
  const now = new Date();
  await db('activities').insert({
    id: uuid(),
    user_id: memory.user_id,
    type: 'memory',
    action: 'deleted',
    entity_id: input.memory_id,
    metadata: JSON.stringify({ content: memory.content.substring(0, 100) }),
    created_at: now.toISOString(),
  });

  return { success: true };
}
