# Context Findings

## Files That Need Modification

| File | Change |
|------|--------|
| `src/db/migrations/005_add_embeddings.ts` | **NEW** - Add embedding column, pgvector extension |
| `src/db/models/Memory.ts` | Add `embedding` field (nullable) |
| `src/tools/memory.ts` | Modify `remember` to queue embedding, modify `recall` for hybrid search |
| `src/services/embedding.ts` | **NEW** - OpenAI embedding generation service |
| `src/services/embedding-worker.ts` | **NEW** - Bull worker for async embedding jobs |
| `src/config/index.ts` | Add `openai.apiKey` config |
| `package.json` | Add `openai` and `pgvector` dependencies |

## Current Implementation Analysis

### Memory Schema (src/db/migrations/002_create_memories.ts)
```typescript
table.uuid('id').primary();
table.string('user_id').notNullable().index();
table.text('content').notNullable();
table.json('tags').defaultTo('[]');
table.integer('recalled_count').notNullable().defaultTo(0);
table.timestamp('created_at').notNullable();
```

### Current Recall Search (src/tools/memory.ts:57-67)
- Uses simple `LIKE` pattern: `where('content', 'like', '%${query}%')`
- Tag filtering done in-memory after fetch
- Orders by `created_at` descending

### Existing Infrastructure
- **Bull/Redis**: Already in `package.json` (bull ^4.16.0, ioredis ^5.4.1)
- **Redis config**: Already in `src/config/index.ts` (`redis.url`)
- **PostgreSQL**: Already supported via `pg ^8.13.0` and `knex ^3.1.0`

## Technical Patterns to Follow

### 1. Migration Pattern (from existing migrations)
```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable pgvector extension (PostgreSQL only)
  if (knex.client.config.client === 'pg') {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');
    await knex.schema.alterTable('memories', (table) => {
      // Use raw for vector type
    });
    await knex.raw(`
      ALTER TABLE memories ADD COLUMN embedding vector(1536)
    `);
    // Create HNSW index for fast similarity search
    await knex.raw(`
      CREATE INDEX memories_embedding_idx ON memories
      USING hnsw (embedding vector_cosine_ops)
    `);
  }
}
```

### 2. Service Pattern (from existing services)
- Export async functions
- Use config from `src/config/index.ts`
- Log activities to `activities` table

### 3. Tool Pattern (from src/tools/memory.ts)
- Zod schemas for input validation
- Return `{ success, data?, error? }` format
- Log all operations to activities table

## Dependencies to Add

```json
{
  "dependencies": {
    "openai": "^4.77.0",
    "pgvector": "^0.2.0"
  },
  "devDependencies": {
    "@types/pg": "^8.11.0"
  }
}
```

## Hybrid Search Strategy

Based on [pgvector best practices](https://github.com/pgvector/pgvector-node):

1. **Two-stage approach**:
   - Stage 1: Fast ANN query with HNSW index (top-N candidates)
   - Stage 2: Re-rank with exact distance + keyword matching

2. **Hybrid scoring formula**:
```sql
SELECT *,
  (1 - (embedding <=> $query_embedding)) * 0.7 +  -- semantic similarity (70%)
  ts_rank(to_tsvector(content), plainto_tsquery($query)) * 0.3  -- FTS score (30%)
  AS hybrid_score
FROM memories
WHERE user_id = $user_id
ORDER BY hybrid_score DESC
LIMIT $limit
```

3. **Fallback for SQLite**: Use existing LIKE search (no embedding)

## Async Embedding Flow

```
remember() called
    ↓
Insert memory (embedding = NULL)
    ↓
Queue Bull job: { memory_id, content }
    ↓
Return immediately to user
    ↓
Worker picks up job
    ↓
Call OpenAI text-embedding-3-small
    ↓
UPDATE memories SET embedding = $vector WHERE id = $memory_id
```

## Backfill Strategy

1. Create CLI command or admin endpoint: `npm run backfill:embeddings`
2. Query all memories where `embedding IS NULL`
3. Batch process (e.g., 100 at a time) to avoid rate limits
4. OpenAI rate limit: 3000 RPM for text-embedding-3-small

## Sources

- [pgvector/pgvector-node](https://github.com/pgvector/pgvector-node) - Official Node.js support
- [pgvector npm package](https://www.npmjs.com/package/pgvector) - Knex.js integration examples
- [Instaclustr pgvector guide](https://www.instaclustr.com/education/vector-database/pgvector-key-features-tutorial-and-pros-and-cons-2026-guide/) - Index types and best practices
- [Timescale hybrid search](https://medium.com/timescale/implementing-filtered-semantic-search-using-pgvector-and-javascript-7c6eb4894c36) - Filtered semantic search patterns
