import { z } from 'zod';

export const ActivityType = z.enum(['reminder', 'memory', 'task', 'query']);
export type ActivityType = z.infer<typeof ActivityType>;

export const ActivitySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  type: ActivityType,
  action: z.string(),
  entity_id: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()),
  created_at: z.coerce.date(),
});

export type Activity = z.infer<typeof ActivitySchema>;

export const CreateActivityInput = z.object({
  user_id: z.string(),
  type: ActivityType,
  action: z.string(),
  entity_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type CreateActivityInput = z.infer<typeof CreateActivityInput>;
