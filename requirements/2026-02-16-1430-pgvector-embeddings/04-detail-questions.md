# Expert Requirements Questions

## Q1: Should memories without embeddings still appear in recall results (with lower ranking)?
**Default if unknown:** Yes (graceful degradation - memories are still valuable even without embeddings)

## Q2: Should we add an `embedding_status` field to track embedding generation state (pending/completed/failed)?
**Default if unknown:** Yes (helps with debugging, retry logic, and showing users which memories are semantically searchable)

## Q3: Should the hybrid search weight be configurable per-query (e.g., `semantic_weight: 0.7`)?
**Default if unknown:** No (fixed 70/30 semantic/keyword split is a good default; adds complexity)

## Q4: Should we store the embedding model version (e.g., "text-embedding-3-small") with each memory for future migration?
**Default if unknown:** Yes (OpenAI may release new models; allows re-embedding with newer versions)

## Q5: Should failed embedding jobs retry automatically with exponential backoff?
**Default if unknown:** Yes (Bull supports this natively; handles transient OpenAI API failures)
