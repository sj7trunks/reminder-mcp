import { z } from 'zod';
import pgvector from 'pgvector';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import type { Memory } from '../db/models/Memory.js';
import type { McpContext } from '../types/context.js';
import { generateEmbedding } from '../services/embedding.js';
import { enqueueEmbeddingJob } from '../services/embedding-worker.js';

const ScopeEnum = z.enum(['personal', 'team', 'application', 'global']);
const ClassificationEnum = z.enum(['foundational', 'tactical', 'observational']);

/** Ensure a chat exists for the given user and chat ID (idempotent) */
async function ensureChatExists(userId: string, chatId: string): Promise<void> {
  const existing = await db('chats').where('id', chatId).first();
  if (!existing) {
    await db('chats').insert({
      id: chatId,
      user_id: userId,
      created_at: new Date().toISOString(),
    });
  }
}

export const RememberSchema = z.object({
  user_id: z.string(),
  content: z.string().min(1).describe('What to remember'),
  tags: z.array(z.string()).optional().default([]).describe('Optional tags for categorization'),
  scope: ScopeEnum.optional().describe('Memory scope: personal, team, application, or global'),
  scope_id: z.string().uuid().optional().describe('Team or application ID for scoped memories'),
  classification: ClassificationEnum.optional().describe('Memory classification: foundational, tactical, or observational'),
  chat_id: z.string().min(1).optional().describe('Optional chat ID to associate this memory with a conversation'),
  supersedes: z.string().min(1).optional().describe('ID of an existing memory this one replaces (marks the old memory as superseded)'),
});

export const RecallSchema = z.object({
  user_id: z.string(),
  query: z.string().optional().describe('Optional search query to filter memories'),
  tags: z.array(z.string()).optional().describe('Filter by tags'),
  embedding_status: z.enum(['pending', 'completed', 'failed']).optional().describe('Optional embedding status filter'),
  limit: z.number().optional().default(50).describe('Maximum number of results'),
  scope: ScopeEnum.optional().describe('Filter by scope'),
  scope_id: z.string().uuid().optional().describe('Filter by specific team or application ID'),
  chat_id: z.string().min(1).optional().describe('Filter by specific chat ID'),
});

export const ForgetSchema = z.object({
  memory_id: z.string().uuid().describe('Memory ID to forget'),
});

export const PromoteMemorySchema = z.object({
  user_id: z.string(),
  memory_id: z.string().uuid().describe('Memory ID to promote'),
  target_scope: ScopeEnum.describe('Target scope to promote to'),
  target_scope_id: z.string().uuid().optional().describe('Target team or application ID'),
});

export const ListScopesSchema = z.object({
  user_id: z.string(),
});

/** Get all team IDs the user belongs to */
async function getUserTeamIds(userId: string): Promise<string[]> {
  const rows = await db('team_memberships')
    .where('user_id', userId)
    .select('team_id');
  return rows.map((r: Record<string, unknown>) => r.team_id as string);
}

/** Get all application IDs the user has access to */
async function getUserAppIds(userId: string): Promise<string[]> {
  const ownedApps = await db('applications')
    .where('created_by', userId)
    .select('id');

  const teamApps = await db('applications')
    .join('team_memberships', 'applications.team_id', 'team_memberships.team_id')
    .where('team_memberships.user_id', userId)
    .whereNotNull('applications.team_id')
    .select('applications.id');

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of [...ownedApps, ...teamApps]) {
    const id = row.id as string;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Check if user is a team admin */
async function isTeamAdmin(userId: string, teamId: string): Promise<boolean> {
  const membership = await db('team_memberships')
    .where({ user_id: userId, team_id: teamId })
    .first();
  return !!membership && (membership.role as string) === 'admin';
}

/** Check if user is a team member */
async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const membership = await db('team_memberships')
    .where({ user_id: userId, team_id: teamId })
    .first();
  return !!membership;
}

/** Check if user is a system admin */
async function isSystemAdmin(userId: string): Promise<boolean> {
  const user = await db('users').where('id', userId).first();
  return !!user && (user.is_admin === true || user.is_admin === 1);
}

/** Validate write permission for a given scope */
async function validateWritePermission(
  userId: string,
  scope: string,
  scopeId: string | undefined,
  context?: McpContext,
): Promise<{ valid: boolean; error?: string }> {
  switch (scope) {
    case 'personal':
      return { valid: true };
    case 'team': {
      const teamId = scopeId || context?.teamId;
      if (!teamId) return { valid: false, error: 'scope_id (team ID) is required for team scope' };
      if (await isTeamMember(userId, teamId)) return { valid: true };
      return { valid: false, error: 'Not a member of the specified team' };
    }
    case 'application': {
      if (!scopeId) return { valid: false, error: 'scope_id (application ID) is required for application scope' };
      const app = await db('applications').where('id', scopeId).first();
      if (!app) return { valid: false, error: 'Application not found' };
      if ((app.created_by as string) === userId) return { valid: true };
      if (app.team_id && await isTeamMember(userId, app.team_id as string)) return { valid: true };
      return { valid: false, error: 'Not authorized for this application' };
    }
    case 'global': {
      const admin = context?.isAdmin ?? await isSystemAdmin(userId);
      if (admin) return { valid: true };
      return { valid: false, error: 'Admin access required for global scope' };
    }
    default:
      return { valid: false, error: `Invalid scope: ${scope}` };
  }
}

export async function remember(
  input: z.infer<typeof RememberSchema>,
  context?: McpContext,
): Promise<{ success: boolean; memory?: Memory; merged_from?: string; error?: string }> {
  // Determine scope — team keys default to team scope
  let scope = input.scope ?? 'personal';
  let scopeId = input.scope_id;

  if (context?.scopeType === 'team' && !input.scope) {
    scope = 'team';
    scopeId = scopeId || context.teamId;
  }

  // Validate write permission
  const perm = await validateWritePermission(input.user_id, scope, scopeId, context);
  if (!perm.valid) {
    return { success: false, error: perm.error };
  }

  // Resolve scope_id for team scope from context
  if (scope === 'team' && !scopeId && context?.teamId) {
    scopeId = context.teamId;
  }

  // Auto-create chat if chat_id is provided
  if (input.chat_id) {
    await ensureChatExists(input.user_id, input.chat_id);
  }

  const id = uuid();
  const now = new Date();
  const tags = input.tags ?? [];
  const embeddingStatus = config.database.type === 'postgres' ? 'pending' : null;

  let mergedFrom: string | undefined;

  // Explicit supersedes — agent specified which memory this replaces
  if (input.supersedes) {
    const oldMemory = await db('memories')
      .where('id', input.supersedes)
      .whereNull('superseded_by')
      .first();
    if (oldMemory) {
      mergedFrom = input.supersedes;
      await db('memories')
        .where('id', input.supersedes)
        .update({ superseded_by: id });
    }
  }

  // Phase 7: Dedup — check for near-duplicate in same scope (Postgres + OpenAI only)
  const isPostgres = config.database.type === 'postgres';
  let precomputedEmbedding: number[] | undefined;

  if (isPostgres && config.openai.apiKey) {
    try {
      const newEmbedding = await generateEmbedding(input.content);
      precomputedEmbedding = newEmbedding;

      // Only run automatic dedup if agent didn't explicitly supersede
      if (!mergedFrom) {
        const embeddingSql = pgvector.toSql(newEmbedding);

        // Build scope filter for dedup query
        let scopeFilter: string;
        const bindings: unknown[] = [embeddingSql];

        if (scope === 'personal') {
          scopeFilter = "m.scope = 'personal' AND m.user_id = ?";
          bindings.push(input.user_id);
        } else if (scope === 'team' || scope === 'application') {
          scopeFilter = 'm.scope = ? AND m.scope_id = ?';
          bindings.push(scope, scopeId);
        } else {
          scopeFilter = "m.scope = 'global'";
        }

        const dupResult = await db.raw(`
          WITH query_embedding AS (
            SELECT ?::vector(1536) AS embedding
          )
          SELECT m.id,
            1 - (m.embedding <=> (SELECT embedding FROM query_embedding)) AS similarity
          FROM memories m
          WHERE ${scopeFilter}
            AND m.embedding IS NOT NULL
            AND m.superseded_by IS NULL
          ORDER BY similarity DESC
          LIMIT 1
        `, bindings);

        if (dupResult.rows?.length > 0) {
          const topMatch = dupResult.rows[0];
          const similarity = Number(topMatch.similarity);
          if (similarity > 0.9) {
            // Mark old memory as superseded by new one
            mergedFrom = topMatch.id as string;
            await db('memories')
              .where('id', mergedFrom)
              .update({ superseded_by: id });
          }
        }
      }
    } catch (error) {
      console.error('Dedup/embedding failed, continuing with normal insert:', error);
    }
  }

  const memory: Memory = {
    id,
    user_id: input.user_id,
    content: input.content,
    tags,
    recalled_count: 0,
    embedding_status: precomputedEmbedding ? 'completed' : embeddingStatus,
    embedding_model: precomputedEmbedding ? 'text-embedding-3-small' : null,
    embedding_error: null,
    scope,
    scope_id: scopeId ?? null,
    author_id: input.user_id,
    promoted_from: null,
    superseded_by: null,
    retrieval_count: 0,
    last_retrieved_at: null,
    classification: input.classification ?? null,
    chat_id: input.chat_id ?? null,
    created_at: now,
  };

  const insertData: Record<string, unknown> = {
    ...memory,
    tags: JSON.stringify(tags),
    created_at: now.toISOString(),
    last_retrieved_at: null,
  };

  // If we pre-computed the embedding for dedup, store it directly
  if (precomputedEmbedding && isPostgres) {
    insertData.embedding = pgvector.toSql(precomputedEmbedding);
  }

  await db('memories').insert(insertData);

  // Only enqueue embedding job if we didn't already compute one
  if (isPostgres && !precomputedEmbedding) {
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
    metadata: JSON.stringify({
      content: input.content.substring(0, 100),
      tags,
      scope,
      scope_id: scopeId,
      chat_id: input.chat_id,
      merged_from: mergedFrom,
    }),
    created_at: now.toISOString(),
  });

  const result: { success: boolean; memory: Memory; merged_from?: string } = { success: true, memory };
  if (mergedFrom) result.merged_from = mergedFrom;
  return result;
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
    scope: (row.scope as Memory['scope']) ?? 'personal',
    scope_id: (row.scope_id as string | null) ?? null,
    author_id: (row.author_id as string | null) ?? null,
    promoted_from: (row.promoted_from as string | null) ?? null,
    superseded_by: (row.superseded_by as string | null) ?? null,
    retrieval_count: Number(row.retrieval_count || 0),
    last_retrieved_at: row.last_retrieved_at ? new Date(row.last_retrieved_at as string) : null,
    classification: (row.classification as Memory['classification']) ?? null,
    chat_id: (row.chat_id as string | null) ?? null,
    created_at: new Date(row.created_at as string),
  };
}

/** Build a scope WHERE clause for multi-scope recall */
function buildScopeFilter(
  userId: string,
  teamIds: string[],
  appIds: string[],
  scopeFilter?: string,
  scopeIdFilter?: string,
): { where: string; bindings: unknown[] } {
  // If a specific scope filter is requested
  if (scopeFilter) {
    if (scopeFilter === 'personal') {
      return { where: "(m.scope = 'personal' AND m.user_id = ?)", bindings: [userId] };
    }
    if (scopeFilter === 'team' && scopeIdFilter) {
      return { where: "(m.scope = 'team' AND m.scope_id = ?)", bindings: [scopeIdFilter] };
    }
    if (scopeFilter === 'application' && scopeIdFilter) {
      return { where: "(m.scope = 'application' AND m.scope_id = ?)", bindings: [scopeIdFilter] };
    }
    if (scopeFilter === 'global') {
      return { where: "m.scope = 'global'", bindings: [] };
    }
    // team/app without scope_id: show all user's teams/apps
    if (scopeFilter === 'team' && teamIds.length > 0) {
      const placeholders = teamIds.map(() => '?').join(', ');
      return { where: `(m.scope = 'team' AND m.scope_id IN (${placeholders}))`, bindings: teamIds };
    }
    if (scopeFilter === 'application' && appIds.length > 0) {
      const placeholders = appIds.map(() => '?').join(', ');
      return { where: `(m.scope = 'application' AND m.scope_id IN (${placeholders}))`, bindings: appIds };
    }
    // Fallback — no matching scope, return nothing
    return { where: '1 = 0', bindings: [] };
  }

  // No scope filter: query personal + all teams + all apps + global
  const clauses: string[] = [];
  const bindings: unknown[] = [];

  // Personal
  clauses.push("(m.scope = 'personal' AND m.user_id = ?)");
  bindings.push(userId);

  // Teams
  if (teamIds.length > 0) {
    const placeholders = teamIds.map(() => '?').join(', ');
    clauses.push(`(m.scope = 'team' AND m.scope_id IN (${placeholders}))`);
    bindings.push(...teamIds);
  }

  // Applications
  if (appIds.length > 0) {
    const placeholders = appIds.map(() => '?').join(', ');
    clauses.push(`(m.scope = 'application' AND m.scope_id IN (${placeholders}))`);
    bindings.push(...appIds);
  }

  // Global
  clauses.push("m.scope = 'global'");

  return { where: `(${clauses.join(' OR ')})`, bindings };
}

async function recallPostgresHybrid(
  input: z.infer<typeof RecallSchema>,
  limit: number,
  teamIds: string[],
  appIds: string[],
): Promise<Record<string, unknown>[]> {
  const scopeResult = buildScopeFilter(input.user_id, teamIds, appIds, input.scope, input.scope_id);

  if (!input.query) {
    // No search query — just filter by scope + superseded_by IS NULL
    const bindings: unknown[] = [...scopeResult.bindings];
    let embeddingFilterSql = '';
    if (input.embedding_status) {
      embeddingFilterSql = ' AND m.embedding_status = ?';
      bindings.push(input.embedding_status);
    }
    let chatFilterSql = '';
    if (input.chat_id) {
      chatFilterSql = ' AND m.chat_id = ?';
      bindings.push(input.chat_id);
    }
    bindings.push(limit);

    const raw = await db.raw(`
      SELECT m.*
      FROM memories m
      WHERE ${scopeResult.where}
        AND m.superseded_by IS NULL
        ${embeddingFilterSql}
        ${chatFilterSql}
      ORDER BY m.created_at DESC
      LIMIT ?
    `, bindings);

    return raw.rows as Record<string, unknown>[];
  }

  try {
    const queryEmbedding = await generateEmbedding(input.query);
    const embeddingSql = pgvector.toSql(queryEmbedding);

    const bindings: unknown[] = [embeddingSql, input.query, input.query, ...scopeResult.bindings];
    let embeddingFilterSql = '';
    if (input.embedding_status) {
      embeddingFilterSql = ' AND m.embedding_status = ?';
      bindings.push(input.embedding_status);
    }
    let chatFilterSql = '';
    if (input.chat_id) {
      chatFilterSql = ' AND m.chat_id = ?';
      bindings.push(input.chat_id);
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
      WHERE ${scopeResult.where}
        AND m.superseded_by IS NULL
        ${embeddingFilterSql}
        ${chatFilterSql}
      ORDER BY hybrid_score DESC, m.created_at DESC
      LIMIT ?
    `, bindings);

    return raw.rows as Record<string, unknown>[];
  } catch (error) {
    console.error('Hybrid search fallback to keyword search:', error);
    const bindings: unknown[] = [...scopeResult.bindings, `%${input.query}%`];
    let embeddingFilterSql = '';
    if (input.embedding_status) {
      embeddingFilterSql = ' AND m.embedding_status = ?';
      bindings.push(input.embedding_status);
    }
    let chatFilterSql = '';
    if (input.chat_id) {
      chatFilterSql = ' AND m.chat_id = ?';
      bindings.push(input.chat_id);
    }
    bindings.push(limit);

    const raw = await db.raw(`
      SELECT m.*
      FROM memories m
      WHERE ${scopeResult.where}
        AND m.superseded_by IS NULL
        AND m.content LIKE ?
        ${embeddingFilterSql}
        ${chatFilterSql}
      ORDER BY m.created_at DESC
      LIMIT ?
    `, bindings);

    return raw.rows as Record<string, unknown>[];
  }
}

export async function recall(
  input: z.infer<typeof RecallSchema>,
  context?: McpContext,
): Promise<{ memories: Memory[] }> {
  const limit = input.limit ?? 50;
  const isPostgres = config.database.type === 'postgres';

  // Resolve user's team and app IDs for multi-scope queries
  let teamIds: string[];
  if (context?.scopeType === 'team' && context.teamId) {
    // Team key — only include the key's team
    teamIds = [context.teamId];
  } else {
    teamIds = await getUserTeamIds(input.user_id);
  }
  const appIds = await getUserAppIds(input.user_id);

  let rows: Record<string, unknown>[] = [];

  if (isPostgres) {
    rows = await recallPostgresHybrid(input, limit, teamIds, appIds);
  } else {
    // SQLite path
    const scopeResult = buildScopeFilter(input.user_id, teamIds, appIds, input.scope, input.scope_id);

    let rawSql = `SELECT m.* FROM memories m WHERE ${scopeResult.where} AND m.superseded_by IS NULL`;
    const bindings: unknown[] = [...scopeResult.bindings];

    if (input.query) {
      rawSql += ' AND m.content LIKE ?';
      bindings.push(`%${input.query}%`);
    }

    if (input.embedding_status) {
      rawSql += ' AND m.embedding_status = ?';
      bindings.push(input.embedding_status);
    }

    if (input.chat_id) {
      rawSql += ' AND m.chat_id = ?';
      bindings.push(input.chat_id);
    }

    rawSql += ' ORDER BY m.created_at DESC LIMIT ?';
    bindings.push(limit);

    rows = await db.raw(rawSql, bindings).then((result: unknown) => {
      // Knex raw returns different shapes for SQLite vs PG
      if (Array.isArray(result)) return result;
      if (result && typeof result === 'object' && 'rows' in (result as Record<string, unknown>)) {
        return (result as { rows: Record<string, unknown>[] }).rows;
      }
      return [];
    });
  }

  // Filter by tags if provided (done in memory since SQLite JSON support is limited)
  let memories: Memory[] = rows.map(mapMemoryRow);

  if (input.tags && input.tags.length > 0) {
    memories = memories.filter((m) =>
      input.tags!.some((tag) => m.tags.includes(tag))
    );
  }

  // Update retrieval tracking for all returned memories
  const memoryIds = memories.map((m) => m.id);
  if (memoryIds.length > 0) {
    const now = new Date();
    await db('memories')
      .whereIn('id', memoryIds)
      .update({
        recalled_count: db.raw('recalled_count + 1'),
        retrieval_count: db.raw('retrieval_count + 1'),
        last_retrieved_at: now.toISOString(),
      });

    // Update local objects
    memories = memories.map((m) => ({
      ...m,
      recalled_count: m.recalled_count + 1,
      retrieval_count: m.retrieval_count + 1,
      last_retrieved_at: now,
    }));

    // Log activity
    for (const memory of memories) {
      await db('activities').insert({
        id: uuid(),
        user_id: input.user_id,
        type: 'memory',
        action: 'recalled',
        entity_id: memory.id,
        metadata: JSON.stringify({ query: input.query, scope: memory.scope }),
        created_at: now.toISOString(),
      });
    }
  }

  return { memories };
}

export async function forget(
  input: z.infer<typeof ForgetSchema> & { user_id: string },
  context?: McpContext,
): Promise<{ success: boolean; error?: string }> {
  const memory = await db('memories')
    .where('id', input.memory_id)
    .first();

  if (!memory) {
    return { success: false, error: 'Memory not found' };
  }

  const scope = (memory.scope as string) || 'personal';
  const authorId = memory.author_id as string | null;
  const userId = input.user_id;

  // Permission check based on scope
  let authorized = false;
  switch (scope) {
    case 'personal':
      authorized = (memory.user_id as string) === userId;
      break;
    case 'team': {
      // Author can delete, or team admin
      if (authorId === userId) {
        authorized = true;
      } else if (memory.scope_id) {
        authorized = await isTeamAdmin(userId, memory.scope_id as string);
      }
      break;
    }
    case 'application': {
      if (authorId === userId) {
        authorized = true;
      } else {
        const app = await db('applications').where('id', memory.scope_id).first();
        if (app?.team_id) {
          authorized = await isTeamAdmin(userId, app.team_id as string);
        }
      }
      break;
    }
    case 'global': {
      authorized = context?.isAdmin ?? await isSystemAdmin(userId);
      break;
    }
  }

  if (!authorized) {
    return { success: false, error: 'Not authorized to delete this memory' };
  }

  await db('memories').where('id', input.memory_id).delete();

  // Log activity
  const now = new Date();
  await db('activities').insert({
    id: uuid(),
    user_id: userId,
    type: 'memory',
    action: 'deleted',
    entity_id: input.memory_id,
    metadata: JSON.stringify({ content: (memory.content as string).substring(0, 100), scope }),
    created_at: now.toISOString(),
  });

  return { success: true };
}

export async function promoteMemory(
  input: z.infer<typeof PromoteMemorySchema>,
): Promise<{ success: boolean; memory?: Memory; error?: string }> {
  const source = await db('memories')
    .where('id', input.memory_id)
    .first();

  if (!source) {
    return { success: false, error: 'Memory not found' };
  }

  // Validate write permission for target scope
  const perm = await validateWritePermission(input.user_id, input.target_scope, input.target_scope_id);
  if (!perm.valid) {
    return { success: false, error: perm.error };
  }

  const id = uuid();
  const now = new Date();
  const tags = parseTags(source.tags);

  const newMemory: Record<string, unknown> = {
    id,
    user_id: input.target_scope === 'personal' ? input.user_id : (source.user_id as string),
    content: source.content as string,
    tags: JSON.stringify(tags),
    recalled_count: 0,
    embedding_status: source.embedding_status,
    embedding_model: source.embedding_model,
    embedding_error: source.embedding_error,
    scope: input.target_scope,
    scope_id: input.target_scope_id || null,
    author_id: input.user_id,
    promoted_from: input.memory_id,
    superseded_by: null,
    retrieval_count: 0,
    last_retrieved_at: null,
    classification: source.classification,
    created_at: now.toISOString(),
  };

  // Carry over embedding if available (Postgres only)
  if (config.database.type === 'postgres' && source.embedding) {
    newMemory.embedding = source.embedding;
  }

  await db('memories').insert(newMemory);

  // Log activity
  await db('activities').insert({
    id: uuid(),
    user_id: input.user_id,
    type: 'memory',
    action: 'promoted',
    entity_id: id,
    metadata: JSON.stringify({
      from_id: input.memory_id,
      target_scope: input.target_scope,
      target_scope_id: input.target_scope_id,
    }),
    created_at: now.toISOString(),
  });

  const memory = mapMemoryRow({
    ...newMemory,
    tags: tags,
    created_at: now.toISOString(),
  });

  return { success: true, memory };
}

export async function listScopes(
  input: z.infer<typeof ListScopesSchema>,
): Promise<{ scopes: Array<{ type: string; id?: string; name?: string }> }> {
  const scopes: Array<{ type: string; id?: string; name?: string }> = [];

  // Personal scope
  scopes.push({ type: 'personal' });

  // User's teams
  const teams = await db('teams')
    .join('team_memberships', 'teams.id', 'team_memberships.team_id')
    .where('team_memberships.user_id', input.user_id)
    .select('teams.id', 'teams.name');

  for (const team of teams) {
    scopes.push({ type: 'team', id: team.id as string, name: team.name as string });
  }

  // User's applications
  const appIds = await getUserAppIds(input.user_id);
  if (appIds.length > 0) {
    const apps = await db('applications').whereIn('id', appIds).select('id', 'name');
    for (const app of apps) {
      scopes.push({ type: 'application', id: app.id as string, name: app.name as string });
    }
  }

  // Global scope
  scopes.push({ type: 'global' });

  return { scopes };
}
