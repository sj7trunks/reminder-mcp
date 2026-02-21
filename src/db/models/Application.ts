import { z } from 'zod';

export const ApplicationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  team_id: z.string().uuid().nullable(),
  created_by: z.string().uuid(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Application = z.infer<typeof ApplicationSchema>;
