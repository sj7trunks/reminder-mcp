import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import {
  createReminder,
  listReminders,
  completeReminder,
  cancelReminder,
} from '../tools/reminders.js';
import { db } from '../db/index.js';

const router = Router();

// GET /api/reminders — list reminders with optional date range
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const limit = req.query.limit as string | undefined;
    const userId = req.user!.id;

    // If date range provided, do a direct query for calendar view
    if (start || end) {
      let query = db('reminders').where('user_id', userId);
      if (start) {
        query = query.where('due_at', '>=', start);
      }
      if (end) {
        query = query.where('due_at', '<=', end);
      }
      if (status && status !== 'all') {
        query = query.where('status', status);
      }
      const rows = await query.orderBy('due_at', 'asc').limit(Number(limit) || 200);
      res.json({ reminders: rows });
      return;
    }

    const result = await listReminders({
      user_id: userId,
      status: (status as any) || 'all',
      limit: Number(limit) || 50,
    });
    res.json(result);
  } catch (error) {
    console.error('List reminders error:', error);
    res.status(500).json({ error: 'Failed to list reminders' });
  }
});

// POST /api/reminders — create a reminder
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, description, due_at, timezone } = req.body;
    const result = await createReminder({
      user_id: req.user!.id,
      title,
      description,
      due_at,
      timezone,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Create reminder error:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// PATCH /api/reminders/:id — update reminder status
router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { action } = req.body as { action: string };
    const userId = req.user!.id;
    const reminderId = req.params.id as string;

    let result: { success: boolean; error?: string };
    if (action === 'complete') {
      result = await completeReminder({ reminder_id: reminderId, user_id: userId });
    } else if (action === 'cancel') {
      result = await cancelReminder({ reminder_id: reminderId, user_id: userId });
    } else {
      res.status(400).json({ error: 'Invalid action. Use "complete" or "cancel".' });
      return;
    }

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Update reminder error:', error);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// DELETE /api/reminders/:id — cancel a reminder
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await cancelReminder({
      reminder_id: req.params.id as string,
      user_id: req.user!.id,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Delete reminder error:', error);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

export default router;
