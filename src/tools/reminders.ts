import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { parseRelativeTime, isValidTimezone, formatInTimezone } from '../services/timezone.js';
import type { Reminder } from '../db/models/Reminder.js';

export const CreateReminderSchema = z.object({
  user_id: z.string().describe('User identifier'),
  title: z.string().min(1).describe('Reminder title'),
  description: z.string().optional().describe('Optional details'),
  due_at: z.string().describe('When to trigger (ISO date string or relative like "tomorrow at 2pm", "in 30 minutes")'),
  timezone: z.string().optional().describe('User timezone (defaults to server default)'),
});

export const ListRemindersSchema = z.object({
  user_id: z.string().describe('User identifier'),
  status: z.enum(['pending', 'triggered', 'completed', 'cancelled', 'all']).optional().default('pending').describe('Filter by status'),
  limit: z.number().optional().default(50).describe('Maximum number of results'),
});

export const ReminderIdSchema = z.object({
  reminder_id: z.string().uuid().describe('Reminder ID'),
});

export async function createReminder(input: z.infer<typeof CreateReminderSchema>): Promise<{ success: boolean; reminder?: Reminder; error?: string }> {
  const timezone = input.timezone || config.defaultTimezone;

  if (!isValidTimezone(timezone)) {
    return { success: false, error: `Invalid timezone: ${timezone}` };
  }

  // Parse due_at - can be ISO string or relative time
  let dueAt = parseRelativeTime(input.due_at, timezone);

  if (!dueAt) {
    return { success: false, error: `Could not parse due_at: ${input.due_at}` };
  }

  if (dueAt <= new Date()) {
    return { success: false, error: 'Reminder due time must be in the future' };
  }

  const id = uuid();
  const now = new Date();

  const reminder: Reminder = {
    id,
    user_id: input.user_id,
    title: input.title,
    description: input.description || null,
    due_at: dueAt,
    timezone,
    status: 'pending',
    created_at: now,
  };

  await db('reminders').insert({
    ...reminder,
    due_at: dueAt.toISOString(),
    created_at: now.toISOString(),
  });

  // Log activity
  await db('activities').insert({
    id: uuid(),
    user_id: input.user_id,
    type: 'reminder',
    action: 'created',
    entity_id: id,
    metadata: JSON.stringify({ title: input.title, due_at: dueAt.toISOString() }),
    created_at: now.toISOString(),
  });

  return {
    success: true,
    reminder: {
      ...reminder,
      due_at: dueAt,
    },
  };
}

export async function listReminders(input: z.infer<typeof ListRemindersSchema>): Promise<{ reminders: Reminder[] }> {
  const status = input.status ?? 'pending';
  const limit = input.limit ?? 50;

  let query = db('reminders').where('user_id', input.user_id);

  if (status !== 'all') {
    query = query.where('status', status);
  }

  const rows = await query.orderBy('due_at', 'asc').limit(limit);

  const reminders: Reminder[] = rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    title: row.title as string,
    description: row.description as string | null,
    due_at: new Date(row.due_at as string),
    timezone: row.timezone as string,
    status: row.status as Reminder['status'],
    created_at: new Date(row.created_at as string),
  }));

  return { reminders };
}

export async function completeReminder(input: z.infer<typeof ReminderIdSchema>): Promise<{ success: boolean; error?: string }> {
  const reminder = await db('reminders').where('id', input.reminder_id).first();

  if (!reminder) {
    return { success: false, error: 'Reminder not found' };
  }

  if (reminder.status === 'completed') {
    return { success: false, error: 'Reminder already completed' };
  }

  const now = new Date();

  await db('reminders').where('id', input.reminder_id).update({ status: 'completed' });

  await db('activities').insert({
    id: uuid(),
    user_id: reminder.user_id,
    type: 'reminder',
    action: 'completed',
    entity_id: input.reminder_id,
    metadata: JSON.stringify({ title: reminder.title }),
    created_at: now.toISOString(),
  });

  return { success: true };
}

export async function cancelReminder(input: z.infer<typeof ReminderIdSchema>): Promise<{ success: boolean; error?: string }> {
  const reminder = await db('reminders').where('id', input.reminder_id).first();

  if (!reminder) {
    return { success: false, error: 'Reminder not found' };
  }

  if (reminder.status !== 'pending') {
    return { success: false, error: `Cannot cancel reminder with status: ${reminder.status}` };
  }

  const now = new Date();

  await db('reminders').where('id', input.reminder_id).update({ status: 'cancelled' });

  await db('activities').insert({
    id: uuid(),
    user_id: reminder.user_id,
    type: 'reminder',
    action: 'cancelled',
    entity_id: input.reminder_id,
    metadata: JSON.stringify({ title: reminder.title }),
    created_at: now.toISOString(),
  });

  return { success: true };
}
