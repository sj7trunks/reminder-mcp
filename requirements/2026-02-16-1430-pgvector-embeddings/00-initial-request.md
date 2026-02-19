# Initial Request: pgvector Embeddings Enhancement

## User Request
Add pgvector embeddings to the reminder-mcp memory system for semantic search capabilities.

## Context
- Existing reminder-mcp has basic `LIKE` substring search in the `recall` tool
- PostgreSQL is already supported for production
- User wants to use `pgvector` extension for vector similarity search
- Goal: Enable semantic recall of memories (find conceptually similar content, not just keyword matches)

## Current State
- **Memory table**: `id`, `user_id`, `content`, `tags` (JSON), `recalled_count`, `created_at`
- **Current search**: SQL `LIKE` pattern matching on content field
- **Database**: SQLite (dev) / PostgreSQL (prod)

## Desired Outcome
- Add embedding column to memories table
- Generate embeddings on `remember` operations
- Hybrid search combining FTS + vector similarity in `recall`
- New `recall_semantic` tool for pure vector search
