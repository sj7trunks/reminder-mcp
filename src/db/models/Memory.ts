import { z } from 'zod';

export const MemorySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  recalled_count: z.number(),
  created_at: z.coerce.date(),
});

export type Memory = z.infer<typeof MemorySchema>;

export const CreateMemoryInput = z.object({
  user_id: z.string(),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

export type CreateMemoryInput = z.infer<typeof CreateMemoryInput>;
