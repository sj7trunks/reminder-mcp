# Discovery Answers

## Q1: Will you use OpenAI's embedding API for generating vectors?
**Answer:** Yes
**Notes:** Using OpenAI's text-embedding-3-small (1536 dimensions, $0.02/1M tokens)

## Q2: Should semantic search also work in SQLite development mode (using a fallback)?
**Answer:** No
**Notes:** PostgreSQL only for semantic search. SQLite falls back to LIKE search. User prefers Docker for PostgreSQL rather than system install. Rolling directly into pre-prod/prod.

## Q3: Do you want embeddings generated asynchronously (background job) rather than blocking the remember operation?
**Answer:** Yes
**Notes:** Use existing Bull/Redis infrastructure for background embedding generation. Memories save instantly, embeddings processed async.

## Q4: Should the recall tool automatically use hybrid search (FTS + semantic) or keep them separate?
**Answer:** Yes
**Notes:** Hybrid search combining keyword (FTS) + semantic (vector similarity) in the existing `recall` tool. No need for separate tools.

## Q5: Will you need to backfill embeddings for existing memories already in your database?
**Answer:** Yes
**Notes:** Migration script/tool needed to generate embeddings for existing memories in the database.
