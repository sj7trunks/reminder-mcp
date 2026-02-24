import { z } from 'zod';

export const ChatSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  created_at: z.coerce.date(),
});

export type Chat = z.infer<typeof ChatSchema>;
