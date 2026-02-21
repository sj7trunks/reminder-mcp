import { z } from 'zod';

export const TeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_by: z.string().uuid(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Team = z.infer<typeof TeamSchema>;
