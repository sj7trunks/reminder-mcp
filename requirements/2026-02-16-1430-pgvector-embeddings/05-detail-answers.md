# Expert Requirements Answers

## Q1: Should memories without embeddings still appear in recall results (with lower ranking)?
**Answer:** Yes
**Notes:** Graceful degradation - memories without embeddings still appear in results. Background job converts old memories. Dashboard should show which memories have embedding issues.

## Q2: Should we add an `embedding_status` field to track embedding generation state?
**Answer:** Yes
**Notes:** Track states: `pending`, `completed`, `failed`, `null` (SQLite). Enables dashboard visibility for debugging and retry logic.

## Q3: Should the hybrid search weight be configurable per-query?
**Answer:** No
**Notes:** Keep it simple. Fixed 70% semantic / 30% keyword split. No need for per-query configuration.

## Q4: Should we store the embedding model version with each memory?
**Answer:** Yes
**Notes:** Add `embedding_model` column (e.g., "text-embedding-3-small"). Future-proofs for model upgrades and allows targeted re-embedding.

## Q5: Should failed embedding jobs retry automatically with exponential backoff?
**Answer:** Yes
**Notes:** 5 retry attempts with exponential backoff. After 5 failures, mark as permanently failed and log the failure reason.
