import { db } from '../db/index.js';

export interface ServerStatus {
  uptime: number;
  database: {
    connected: boolean;
    type: string;
  };
  counts: {
    pending_reminders: number;
    active_tasks: number;
    total_memories: number;
  };
}

const startTime = Date.now();

export async function getServerStatus(): Promise<ServerStatus> {
  let connected = false;
  let pendingReminders = 0;
  let activeTasks = 0;
  let totalMemories = 0;

  try {
    // Check database connection
    await db.raw('SELECT 1');
    connected = true;

    // Get counts
    const [reminders] = await db('reminders').where('status', 'pending').count('id as count');
    pendingReminders = Number(reminders?.count || 0);

    const [tasks] = await db('tasks').whereIn('status', ['pending', 'in_progress']).count('id as count');
    activeTasks = Number(tasks?.count || 0);

    const [memories] = await db('memories').count('id as count');
    totalMemories = Number(memories?.count || 0);
  } catch (error) {
    console.error('Status check error:', error);
  }

  return {
    uptime: Date.now() - startTime,
    database: {
      connected,
      type: db.client.config.client as string,
    },
    counts: {
      pending_reminders: pendingReminders,
      active_tasks: activeTasks,
      total_memories: totalMemories,
    },
  };
}
