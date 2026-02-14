import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { remember, recall, forget } from '../tools/memory.js';

const router = Router();

// GET /api/memories — search/list memories
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const query = req.query.query as string | undefined;
    const tags = req.query.tags as string | undefined;
    const limit = req.query.limit as string | undefined;
    const parsedTags = tags ? tags.split(',') : undefined;

    const result = await recall({
      user_id: req.user!.id,
      query,
      tags: parsedTags,
      limit: Number(limit) || 50,
    });
    res.json(result);
  } catch (error) {
    console.error('List memories error:', error);
    res.status(500).json({ error: 'Failed to list memories' });
  }
});

// POST /api/memories — store a new memory
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { content, tags } = req.body;
    const result = await remember({
      user_id: req.user!.id,
      content,
      tags: tags || [],
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Create memory error:', error);
    res.status(500).json({ error: 'Failed to create memory' });
  }
});

// DELETE /api/memories/:id — forget a memory
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await forget({
      memory_id: req.params.id as string,
      user_id: req.user!.id,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Delete memory error:', error);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

export default router;
