import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import {
  startTask,
  listTasks,
  checkTask,
  completeTask,
  updateTask,
} from '../tools/tasks.js';

const router = Router();

// GET /api/tasks — list tasks
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = req.query.limit as string | undefined;
    const result = await listTasks({
      user_id: req.user!.id,
      status: (status as any) || 'all',
      limit: Number(limit) || 50,
    });
    res.json(result);
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

// GET /api/tasks/:id — get single task
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await checkTask({
      task_id: req.params.id as string,
      user_id: req.user!.id,
    });

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

// POST /api/tasks — create a task
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { title, command, check_interval_ms } = req.body;
    const result = await startTask({
      user_id: req.user!.id,
      title,
      command,
      check_interval_ms,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PATCH /api/tasks/:id — update task status
router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { action, status, notes } = req.body as { action?: string; status?: any; notes?: string };
    const userId = req.user!.id;
    const taskId = req.params.id as string;

    if (action === 'complete') {
      const result = await completeTask({ task_id: taskId, user_id: userId });
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json(result);
      return;
    }

    const result = await updateTask({
      task_id: taskId,
      user_id: userId,
      status,
      notes,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/tasks/:id — complete/cancel a task
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await completeTask({
      task_id: req.params.id as string,
      user_id: req.user!.id,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
