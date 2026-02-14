import { z } from 'zod';

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  key_hash: z.string(),
  prefix: z.string().max(8),
  name: z.string().default('default'),
  created_at: z.coerce.date(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;
