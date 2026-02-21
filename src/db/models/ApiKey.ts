import { z } from 'zod';

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  key_hash: z.string(),
  prefix: z.string().max(8),
  name: z.string().default('default'),
  scope_type: z.enum(['user', 'team']).default('user'),
  team_id: z.string().uuid().nullable().optional(),
  created_at: z.coerce.date(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;
