import { z } from 'zod';

export const MemorySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  recalled_count: z.number(),
  embedding: z.array(z.number()).nullable().optional(),
  embedding_status: z.enum(['pending', 'completed', 'failed']).nullable().optional(),
  embedding_model: z.string().nullable().optional(),
  embedding_error: z.string().nullable().optional(),
  scope: z.enum(['personal', 'team', 'application', 'global']).default('personal'),
  scope_id: z.string().uuid().nullable().optional(),
  author_id: z.string().uuid().nullable().optional(),
  promoted_from: z.string().uuid().nullable().optional(),
  superseded_by: z.string().uuid().nullable().optional(),
  retrieval_count: z.number().default(0),
  last_retrieved_at: z.coerce.date().nullable().optional(),
  classification: z.enum(['foundational', 'tactical', 'observational']).nullable().optional(),
  chat_id: z.string().nullable().optional(),
  created_at: z.coerce.date(),
});

export type Memory = z.infer<typeof MemorySchema>;

export const CreateMemoryInput = z.object({
  user_id: z.string(),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  scope: z.enum(['personal', 'team', 'application', 'global']).optional().default('personal'),
  scope_id: z.string().uuid().optional(),
  classification: z.enum(['foundational', 'tactical', 'observational']).optional(),
  chat_id: z.string().optional(),
});

export type CreateMemoryInput = z.infer<typeof CreateMemoryInput>;
