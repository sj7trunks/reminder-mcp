import { z } from 'zod';
import { db } from '../db/index.js';
import { subDays, subWeeks, subMonths } from 'date-fns';
import type { Activity } from '../db/models/Activity.js';

export const GetActivitySchema = z.object({
  user_id: z.string(),
  type: z.enum(['reminder', 'memory', 'task', 'query', 'all']).optional().default('all').describe('Filter by activity type'),
  action: z.string().optional().describe('Filter by action (e.g., created, completed)'),
  since: z.string().optional().describe('Start time (ISO date or relative like "1 week", "3 days")'),
  until: z.string().optional().describe('End time (ISO date)'),
  limit: z.number().optional().default(100).describe('Maximum number of results'),
});

export const GetSummarySchema = z.object({
  user_id: z.string(),
  period: z.enum(['day', 'week', 'month']).optional().default('week').describe('Time period for summary'),
});

function parseRelativeTime(input: string): Date | null {
  const now = new Date();
  const lower = input.toLowerCase().trim();

  const match = lower.match(/(\d+)\s*(day|days|week|weeks|month|months)/);
  if (match) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];

    if (unit.startsWith('day')) {
      return subDays(now, amount);
    } else if (unit.startsWith('week')) {
      return subWeeks(now, amount);
    } else if (unit.startsWith('month')) {
      return subMonths(now, amount);
    }
  }

  // Try parsing as ISO date
  try {
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch {
    // Not a valid date
  }

  return null;
}

export async function getActivity(input: z.infer<typeof GetActivitySchema>): Promise<{ activities: Activity[] }> {
  const type = input.type ?? 'all';
  const limit = input.limit ?? 100;

  let query = db('activities').where('user_id', input.user_id);

  if (type !== 'all') {
    query = query.where('type', type);
  }

  if (input.action) {
    query = query.where('action', input.action);
  }

  if (input.since) {
    const sinceDate = parseRelativeTime(input.since);
    if (sinceDate) {
      query = query.where('created_at', '>=', sinceDate.toISOString());
    }
  }

  if (input.until) {
    const untilDate = new Date(input.until);
    if (!isNaN(untilDate.getTime())) {
      query = query.where('created_at', '<=', untilDate.toISOString());
    }
  }

  const rows = await query.orderBy('created_at', 'desc').limit(limit);

  const activities: Activity[] = rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user_id: row.user_id as string,
    type: row.type as Activity['type'],
    action: row.action as string,
    entity_id: row.entity_id as string | null,
    metadata: JSON.parse((row.metadata as string) || '{}'),
    created_at: new Date(row.created_at as string),
  }));

  return { activities };
}

interface ActivitySummary {
  period: string;
  total_activities: number;
  by_type: Record<string, number>;
  by_action: Record<string, number>;
  reminders: {
    created: number;
    completed: number;
    triggered: number;
  };
  memories: {
    created: number;
    recalled: number;
    deleted: number;
  };
  tasks: {
    started: number;
    completed: number;
    checkins: number;
  };
}

export async function getSummary(input: z.infer<typeof GetSummarySchema>): Promise<{ summary: ActivitySummary }> {
  const now = new Date();
  const period = input.period ?? 'week';
  let since: Date;

  switch (period) {
    case 'day':
      since = subDays(now, 1);
      break;
    case 'week':
      since = subWeeks(now, 1);
      break;
    case 'month':
      since = subMonths(now, 1);
      break;
  }

  const activities = await db('activities')
    .where('user_id', input.user_id)
    .where('created_at', '>=', since.toISOString())
    .select('type', 'action');

  const summary: ActivitySummary = {
    period: period,
    total_activities: activities.length,
    by_type: {},
    by_action: {},
    reminders: { created: 0, completed: 0, triggered: 0 },
    memories: { created: 0, recalled: 0, deleted: 0 },
    tasks: { started: 0, completed: 0, checkins: 0 },
  };

  for (const activity of activities) {
    // Count by type
    summary.by_type[activity.type] = (summary.by_type[activity.type] || 0) + 1;

    // Count by action
    summary.by_action[activity.action] = (summary.by_action[activity.action] || 0) + 1;

    // Detailed breakdowns
    if (activity.type === 'reminder') {
      if (activity.action === 'created') summary.reminders.created++;
      if (activity.action === 'completed') summary.reminders.completed++;
      if (activity.action === 'triggered') summary.reminders.triggered++;
    } else if (activity.type === 'memory') {
      if (activity.action === 'created') summary.memories.created++;
      if (activity.action === 'recalled') summary.memories.recalled++;
      if (activity.action === 'deleted') summary.memories.deleted++;
    } else if (activity.type === 'task') {
      if (activity.action === 'started') summary.tasks.started++;
      if (activity.action === 'completed') summary.tasks.completed++;
      if (activity.action === 'checkin') summary.tasks.checkins++;
    }
  }

  return { summary };
}
