import { z } from 'zod';

export const TaskStatus = z.enum(['pending', 'in_progress', 'completed', 'failed']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  title: z.string(),
  command: z.string().nullable(),
  status: TaskStatus,
  check_interval_ms: z.number(),
  last_check_at: z.coerce.date().nullable(),
  next_check_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  completed_at: z.coerce.date().nullable(),
});

export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskInput = z.object({
  user_id: z.string(),
  title: z.string().min(1),
  command: z.string().optional(),
  check_interval_ms: z.number().positive().default(300000), // 5 minutes
});

export type CreateTaskInput = z.infer<typeof CreateTaskInput>;
