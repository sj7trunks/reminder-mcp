# Discovery Questions

## Q1: Will you use OpenAI's embedding API for generating vectors?
**Default if unknown:** Yes (OpenAI's text-embedding-3-small is cost-effective and widely used)

## Q2: Should semantic search also work in SQLite development mode (using a fallback)?
**Default if unknown:** No (pgvector is PostgreSQL-only; dev mode can fall back to existing LIKE search)

## Q3: Do you want embeddings generated asynchronously (background job) rather than blocking the remember operation?
**Default if unknown:** No (synchronous is simpler; memories are small and embedding is fast ~100-200ms)

## Q4: Should the recall tool automatically use hybrid search (FTS + semantic) or keep them separate?
**Default if unknown:** Yes (hybrid search gives best results; users don't need to think about which to use)

## Q5: Will you need to backfill embeddings for existing memories already in your database?
**Default if unknown:** Yes (existing memories should be searchable semantically too)
