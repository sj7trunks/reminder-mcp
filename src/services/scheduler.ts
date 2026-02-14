import { db } from '../db/index.js';
import { sendNotification } from './notifier.js';
import { v4 as uuid } from 'uuid';

interface PendingCheckup {
  type: 'reminder' | 'task';
  id: string;
  title: string;
  due_at?: Date;
  last_check_at?: Date;
  metadata: Record<string, unknown>;
}

export async function getPendingCheckups(): Promise<PendingCheckup[]> {
  const now = new Date();
  const checkups: PendingCheckup[] = [];

  // Get due reminders
  const dueReminders = await db('reminders')
    .where('status', 'pending')
    .where('due_at', '<=', now.toISOString());

  for (const reminder of dueReminders) {
    checkups.push({
      type: 'reminder',
      id: reminder.id,
      title: reminder.title,
      due_at: new Date(reminder.due_at),
      metadata: {
        description: reminder.description,
      },
    });

    // Update status to triggered
    await db('reminders').where('id', reminder.id).update({ status: 'triggered' });

    // Send notification
    await sendNotification({
      type: 'reminder',
      user_id: reminder.user_id,
      title: reminder.title,
      message: reminder.description || 'Your reminder is due',
      entity_id: reminder.id,
    });

    // Log activity
    await db('activities').insert({
      id: uuid(),
      user_id: reminder.user_id,
      type: 'reminder',
      action: 'triggered',
      entity_id: reminder.id,
      metadata: JSON.stringify({ title: reminder.title }),
      created_at: now.toISOString(),
    });
  }

  // Get tasks needing check-in
  const dueTasks = await db('tasks')
    .whereIn('status', ['pending', 'in_progress'])
    .where('next_check_at', '<=', now.toISOString());

  for (const task of dueTasks) {
    checkups.push({
      type: 'task',
      id: task.id,
      title: task.title,
      last_check_at: task.last_check_at ? new Date(task.last_check_at) : undefined,
      metadata: {
        command: task.command,
        status: task.status,
        check_interval_ms: task.check_interval_ms,
      },
    });

    // Update last check time and schedule next check
    const nextCheck = new Date(now.getTime() + task.check_interval_ms);
    await db('tasks').where('id', task.id).update({
      last_check_at: now.toISOString(),
      next_check_at: nextCheck.toISOString(),
    });

    // Send notification
    await sendNotification({
      type: 'task_checkin',
      user_id: task.user_id,
      title: task.title,
      message: `Check-in needed for task: ${task.title}`,
      entity_id: task.id,
    });

    // Log activity
    await db('activities').insert({
      id: uuid(),
      user_id: task.user_id,
      type: 'task',
      action: 'checkin',
      entity_id: task.id,
      metadata: JSON.stringify({ title: task.title }),
      created_at: now.toISOString(),
    });
  }

  return checkups;
}

// Optional: Background scheduler using setInterval
// For production, use Bull queue with Redis
let schedulerInterval: NodeJS.Timeout | null = null;

export function startScheduler(intervalMs: number = 60000): void {
  if (schedulerInterval) {
    return;
  }

  console.log(`Starting scheduler with ${intervalMs}ms interval`);

  schedulerInterval = setInterval(async () => {
    try {
      await getPendingCheckups();
    } catch (error) {
      console.error('Scheduler error:', error);
    }
  }, intervalMs);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Scheduler stopped');
  }
}
