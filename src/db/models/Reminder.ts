import { z } from 'zod';

export const ReminderStatus = z.enum(['pending', 'triggered', 'completed', 'cancelled']);
export type ReminderStatus = z.infer<typeof ReminderStatus>;

export const ReminderSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  due_at: z.coerce.date(),
  timezone: z.string(),
  status: ReminderStatus,
  created_at: z.coerce.date(),
});

export type Reminder = z.infer<typeof ReminderSchema>;

export const CreateReminderInput = z.object({
  user_id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  due_at: z.string().or(z.date()),
  timezone: z.string().default('UTC'),
});

export type CreateReminderInput = z.infer<typeof CreateReminderInput>;
