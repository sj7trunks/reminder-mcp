import { z } from 'zod';

export const TeamMembershipSchema = z.object({
  user_id: z.string().uuid(),
  team_id: z.string().uuid(),
  role: z.enum(['admin', 'member']),
  created_at: z.coerce.date(),
});

export type TeamMembership = z.infer<typeof TeamMembershipSchema>;
