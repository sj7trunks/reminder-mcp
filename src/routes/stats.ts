import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { subDays } from 'date-fns';

const router = Router();

// GET /api/stats/summary — counts for dashboard stat cards
router.get('/summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const [reminders, memories, tasks] = await Promise.all([
      db('reminders').where('user_id', userId).count('id as count').first(),
      db('memories').where('user_id', userId).count('id as count').first(),
      db('tasks').where('user_id', userId).count('id as count').first(),
    ]);

    const [pendingReminders, activeTasks] = await Promise.all([
      db('reminders').where('user_id', userId).where('status', 'pending').count('id as count').first(),
      db('tasks').where('user_id', userId).whereIn('status', ['pending', 'in_progress']).count('id as count').first(),
    ]);

    res.json({
      total_reminders: Number(reminders?.count || 0),
      total_memories: Number(memories?.count || 0),
      total_tasks: Number(tasks?.count || 0),
      pending_reminders: Number(pendingReminders?.count || 0),
      active_tasks: Number(activeTasks?.count || 0),
    });
  } catch (error) {
    console.error('Stats summary error:', error);
    res.status(500).json({ error: 'Failed to get stats summary' });
  }
});

// GET /api/stats/activity — Recharts-formatted activity timeline
router.get('/activity', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const range = (req.query.range as string) || '30d';

    // Parse range
    const days = parseInt(range.replace('d', ''), 10) || 30;
    const since = subDays(new Date(), days);

    const activities = await db('activities')
      .where('user_id', userId)
      .where('created_at', '>=', since.toISOString())
      .select('type', 'action', 'created_at');

    // Group by date
    const byDate: Record<string, { reminders: number; memories: number; tasks: number }> = {};

    for (const activity of activities) {
      const date = new Date(activity.created_at).toISOString().split('T')[0];
      if (!byDate[date]) {
        byDate[date] = { reminders: 0, memories: 0, tasks: 0 };
      }
      if (activity.type === 'reminder') byDate[date].reminders++;
      else if (activity.type === 'memory') byDate[date].memories++;
      else if (activity.type === 'task') byDate[date].tasks++;
    }

    // Fill in missing dates and sort
    const data: Array<{ date: string; reminders: number; memories: number; tasks: number }> = [];
    const current = new Date(since);
    const today = new Date();

    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];
      data.push({
        date: dateStr,
        reminders: byDate[dateStr]?.reminders || 0,
        memories: byDate[dateStr]?.memories || 0,
        tasks: byDate[dateStr]?.tasks || 0,
      });
      current.setDate(current.getDate() + 1);
    }

    res.json({ data });
  } catch (error) {
    console.error('Stats activity error:', error);
    res.status(500).json({ error: 'Failed to get activity stats' });
  }
});

// GET /api/stats/overview — combined overview for dashboard
router.get('/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const since = subDays(new Date(), 7);

    const recentActivity = await db('activities')
      .where('user_id', userId)
      .where('created_at', '>=', since.toISOString())
      .orderBy('created_at', 'desc')
      .limit(10)
      .select('type', 'action', 'entity_id', 'metadata', 'created_at');

    res.json({ recent_activity: recentActivity });
  } catch (error) {
    console.error('Stats overview error:', error);
    res.status(500).json({ error: 'Failed to get overview' });
  }
});

export default router;
