import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { sendNotification } from '../services/notifier.js';
import type { Task } from '../db/models/Task.js';

export const StartTaskSchema = z.object({
  user_id: z.string(),
  title: z.string().min(1).describe('Task description'),
  command: z.string().optional().describe('Original command/prompt'),
  check_interval_ms: z.number().positive().optional().default(300000).describe('How often to check (default 5 minutes)'),
});

export const TaskIdSchema = z.object({
  task_id: z.string().uuid().describe('Task ID'),
});

export const ListTasksSchema = z.object({
  user_id: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'all']).optional().default('all').describe('Filter by status'),
  limit: z.number().optional().default(50).describe('Maximum number of results'),
});

export const UpdateTaskSchema = z.object({
  task_id: z.string().uuid().describe('Task ID'),
  status: z.enum(['in_progress', 'completed', 'failed']).optional().describe('New status'),
  notes: z.string().optional().describe('Progress notes'),
});

export async function startTask(input: z.infer<typeof StartTaskSchema>): Promise<{ success: boolean; task?: Task; error?: string }> {
  const id = uuid();
  const now = new Date();
  const checkIntervalMs = input.check_interval_ms ?? 300000;
  const nextCheck = new Date(now.getTime() + checkIntervalMs);

  const task: Task = {
    id,
    user_id: input.user_id,
    title: input.title,
    command: input.command || null,
    status: 'in_progress',
    check_interval_ms: checkIntervalMs,
    last_check_at: null,
    next_check_at: nextCheck,
    created_at: now,
    completed_at: null,
  };

  await db('tasks').insert({
    ...task,
    next_check_at: nextCheck.toISOString(),
    created_at: now.toISOString(),
  });

  // Log activity
  await db('activities').insert({
    id: uuid(),
    user_id: input.user_id,
    type: 'task',
    action: 'started',
    entity_id: id,
    metadata: JSON.stringify({ title: input.title }),
    created_at: now.toISOString(),
  });

  return { success: true, task };
}

export async function checkTask(input: z.infer<typeof TaskIdSchema> & { user_id: string }): Promise<{ success: boolean; task?: Task; error?: string }> {
  const row = await db('tasks')
    .where('id', input.task_id)
    .where('user_id', input.user_id)
    .first();

  if (!row) {
    return { success: false, error: 'Task not found' };
  }

  const task: Task = {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    command: row.command,
    status: row.status,
    check_interval_ms: row.check_interval_ms,
    last_check_at: row.last_check_at ? new Date(row.last_check_at) : null,
    next_check_at: row.next_check_at ? new Date(row.next_check_at) : null,
    created_at: new Date(row.created_at),
    completed_at: row.completed_at ? new Date(row.completed_at) : null,
  };

  return { success: true, task };
}

export async function listTasks(input: z.infer<typeof ListTasksSchema>): Promise<{ tasks: Task[] }> {
  const status = input.status ?? 'all';
  const limit = input.limit ?? 50;

  let query = db('tasks').where('user_id', input.user_id);

  if (status !== 'all') {
    query = query.where('status', status);
  }

  const rows = await query.orderBy('created_at', 'desc').limit(limit);

  const tasks: Task[] = rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    command: row.command as string | null,
    status: row.status as Task['status'],
    check_interval_ms: row.check_interval_ms as number,
    last_check_at: row.last_check_at ? new Date(row.last_check_at as string) : null,
    next_check_at: row.next_check_at ? new Date(row.next_check_at as string) : null,
    created_at: new Date(row.created_at as string),
    completed_at: row.completed_at ? new Date(row.completed_at as string) : null,
  }));

  return { tasks };
}

export async function completeTask(input: z.infer<typeof TaskIdSchema> & { user_id: string }): Promise<{ success: boolean; error?: string }> {
  const task = await db('tasks')
    .where('id', input.task_id)
    .where('user_id', input.user_id)
    .first();

  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  if (task.status === 'completed') {
    return { success: false, error: 'Task already completed' };
  }

  const now = new Date();

  await db('tasks').where('id', input.task_id).update({
    status: 'completed',
    completed_at: now.toISOString(),
    next_check_at: null,
  });

  // Send notification
  await sendNotification({
    type: 'task_complete',
    user_id: task.user_id,
    title: task.title,
    message: `Task completed: ${task.title}`,
    entity_id: input.task_id,
  });

  // Log activity
  await db('activities').insert({
    id: uuid(),
    user_id: input.user_id,
    type: 'task',
    action: 'completed',
    entity_id: input.task_id,
    metadata: JSON.stringify({ title: task.title }),
    created_at: now.toISOString(),
  });

  return { success: true };
}

export async function updateTask(input: z.infer<typeof UpdateTaskSchema> & { user_id: string }): Promise<{ success: boolean; error?: string }> {
  const task = await db('tasks')
    .where('id', input.task_id)
    .where('user_id', input.user_id)
    .first();

  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  const now = new Date();
  const updates: Record<string, unknown> = {};

  if (input.status) {
    updates.status = input.status;
    if (input.status === 'completed' || input.status === 'failed') {
      updates.completed_at = now.toISOString();
      updates.next_check_at = null;
    }
  }

  if (Object.keys(updates).length > 0) {
    await db('tasks').where('id', input.task_id).update(updates);
  }

  // Log activity
  await db('activities').insert({
    id: uuid(),
    user_id: input.user_id,
    type: 'task',
    action: 'updated',
    entity_id: input.task_id,
    metadata: JSON.stringify({ status: input.status, notes: input.notes }),
    created_at: now.toISOString(),
  });

  return { success: true };
}
