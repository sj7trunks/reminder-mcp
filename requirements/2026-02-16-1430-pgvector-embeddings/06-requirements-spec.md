# Requirements Specification: pgvector Embeddings Enhancement

## Problem Statement

The current `recall` tool in reminder-mcp uses basic SQL `LIKE` pattern matching, which only finds exact substring matches. Users cannot find conceptually similar memories - searching "authentication" won't find a memory about "login security".

## Solution Overview

Add semantic search capabilities using pgvector and OpenAI embeddings:
1. Generate vector embeddings for all memories asynchronously
2. Implement hybrid search combining keyword matching (30%) and semantic similarity (70%)
3. Track embedding status for dashboard visibility
4. Gracefully degrade for SQLite (dev mode) and memories without embeddings

---

## Functional Requirements

### FR-1: Embedding Generation
- **FR-1.1**: When a memory is created via `remember`, queue an async Bull job to generate its embedding
- **FR-1.2**: Use OpenAI `text-embedding-3-small` model (1536 dimensions)
- **FR-1.3**: Store the embedding in a `vector(1536)` column
- **FR-1.4**: Store the model version in `embedding_model` column (e.g., "text-embedding-3-small")
- **FR-1.5**: Retry failed jobs up to 5 times with exponential backoff (1min, 2min, 4min, 8min, 16min)
- **FR-1.6**: After 5 failures, mark `embedding_status` as `failed` and log the error reason

### FR-2: Embedding Status Tracking
- **FR-2.1**: Add `embedding_status` enum column: `pending`, `completed`, `failed`
- **FR-2.2**: Set status to `pending` on memory creation (PostgreSQL mode)
- **FR-2.3**: Set status to `null` for SQLite mode (no embedding support)
- **FR-2.4**: Update status to `completed` when embedding successfully generated
- **FR-2.5**: Update status to `failed` with error metadata when retries exhausted

### FR-3: Hybrid Search (recall tool)
- **FR-3.1**: When PostgreSQL is used and query is provided, perform hybrid search
- **FR-3.2**: Combine semantic similarity (70% weight) with keyword matching (30% weight)
- **FR-3.3**: Include memories without embeddings in results (ranked lower)
- **FR-3.4**: Fall back to existing LIKE search for SQLite mode
- **FR-3.5**: Maintain backward compatibility - existing `recall` API unchanged

### FR-4: Backfill Existing Memories
- **FR-4.1**: Provide CLI command `npm run backfill:embeddings` to generate embeddings for existing memories
- **FR-4.2**: Process memories in batches of 100 to respect rate limits
- **FR-4.3**: Skip memories that already have embeddings
- **FR-4.4**: Log progress and errors during backfill

### FR-5: Dashboard Visibility (existing frontend)
- **FR-5.1**: Expose embedding status in memory list API responses
- **FR-5.2**: Allow filtering memories by `embedding_status` (pending/completed/failed)
- **FR-5.3**: Show error reason for failed embeddings

---

## Technical Requirements

### TR-1: Database Schema Changes

**New Migration: `005_add_embeddings.ts`**
```sql
-- PostgreSQL only
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE memories ADD COLUMN embedding vector(1536);
ALTER TABLE memories ADD COLUMN embedding_status VARCHAR(20) DEFAULT NULL;
ALTER TABLE memories ADD COLUMN embedding_model VARCHAR(50) DEFAULT NULL;
ALTER TABLE memories ADD COLUMN embedding_error TEXT DEFAULT NULL;

-- HNSW index for fast similarity search
CREATE INDEX memories_embedding_idx ON memories
USING hnsw (embedding vector_cosine_ops);

-- Index for status filtering
CREATE INDEX memories_embedding_status_idx ON memories (embedding_status);
```

### TR-2: New Files

| File | Purpose |
|------|---------|
| `src/services/embedding.ts` | OpenAI embedding generation service |
| `src/services/embedding-worker.ts` | Bull worker for async embedding jobs |
| `src/scripts/backfill-embeddings.ts` | CLI script for backfilling existing memories |

### TR-3: Modified Files

| File | Changes |
|------|---------|
| `src/db/models/Memory.ts` | Add `embedding`, `embedding_status`, `embedding_model`, `embedding_error` fields |
| `src/tools/memory.ts` | Queue embedding job in `remember`, hybrid search in `recall` |
| `src/config/index.ts` | Add `openai.apiKey` configuration |
| `package.json` | Add `openai`, `pgvector` dependencies |

### TR-4: Dependencies

```json
{
  "dependencies": {
    "openai": "^4.77.0",
    "pgvector": "^0.2.0"
  }
}
```

### TR-5: Environment Variables

```bash
OPENAI_API_KEY=sk-...           # Required for embedding generation
```

### TR-6: Hybrid Search Query (PostgreSQL)

```sql
WITH query_embedding AS (
  SELECT $1::vector(1536) as embedding
)
SELECT
  m.*,
  CASE
    WHEN m.embedding IS NOT NULL THEN
      (1 - (m.embedding <=> (SELECT embedding FROM query_embedding))) * 0.7 +
      COALESCE(ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', $2)), 0) * 0.3
    ELSE
      COALESCE(ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', $2)), 0) * 0.3
  END as hybrid_score
FROM memories m
WHERE m.user_id = $3
ORDER BY hybrid_score DESC
LIMIT $4;
```

---

## Implementation Hints

### Embedding Service Pattern
```typescript
// src/services/embedding.ts
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}
```

### Bull Worker Pattern
```typescript
// src/services/embedding-worker.ts
import Queue from 'bull';

const embeddingQueue = new Queue('embeddings', config.redis.url);

embeddingQueue.process(async (job) => {
  const { memoryId, content } = job.data;
  const embedding = await generateEmbedding(content);
  await db('memories')
    .where('id', memoryId)
    .update({
      embedding: pgvector.toSql(embedding),
      embedding_status: 'completed',
      embedding_model: 'text-embedding-3-small',
    });
});

// Configure retries
embeddingQueue.on('failed', async (job, err) => {
  if (job.attemptsMade >= 5) {
    await db('memories')
      .where('id', job.data.memoryId)
      .update({
        embedding_status: 'failed',
        embedding_error: err.message,
      });
  }
});
```

### pgvector with Knex
```typescript
import pgvector from 'pgvector';

// Register pgvector type with pg
pgvector.registerType(pg);

// Insert embedding
await db('memories').where('id', id).update({
  embedding: pgvector.toSql(embedding),
});

// Query with cosine distance
const results = await db.raw(`
  SELECT *, embedding <=> ? as distance
  FROM memories
  ORDER BY distance
  LIMIT ?
`, [pgvector.toSql(queryEmbedding), limit]);
```

---

## Acceptance Criteria

- [ ] `remember` creates memory immediately, embedding generates in background
- [ ] `recall` returns semantically similar results in PostgreSQL mode
- [ ] `recall` falls back to LIKE search in SQLite mode
- [ ] Memories without embeddings appear in results (lower ranked)
- [ ] `embedding_status` field shows current state (pending/completed/failed)
- [ ] Failed embeddings show error reason
- [ ] Backfill script processes existing memories
- [ ] Dashboard can filter by embedding status
- [ ] OpenAI API failures retry up to 5 times before failing permanently

---

## Assumptions

1. OpenAI API key will be available in production environment
2. Redis is available for Bull queue (already optional dep)
3. PostgreSQL 15+ with pgvector extension available in Docker
4. Rate limits: OpenAI allows 3000 RPM for text-embedding-3-small
5. Average memory content is under 8000 tokens (model limit)

---

## Out of Scope

- Local embedding models (sentence-transformers, Ollama)
- SQLite vector search (sqlite-vss)
- Per-query weight configuration
- Embedding cost tracking/budgeting
- Multi-tenant embedding isolation
