import { Router } from 'express';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/keys — list user's API keys
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const keys = await db('api_keys')
      .where('user_id', req.user!.id)
      .select('id', 'prefix', 'name', 'created_at')
      .orderBy('created_at', 'desc');

    res.json(keys);
  } catch (error) {
    console.error('List keys error:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// POST /api/keys — create a new API key
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;

    // Generate a random API key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 8);
    const id = uuid();
    const now = new Date().toISOString();

    await db('api_keys').insert({
      id,
      user_id: req.user!.id,
      key_hash: keyHash,
      prefix,
      name: name || 'default',
      created_at: now,
    });

    // Return the full key only on creation (never stored in plaintext)
    res.status(201).json({
      id,
      key: rawKey,
      prefix,
      name: name || 'default',
      created_at: now,
    });
  } catch (error) {
    console.error('Create key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// DELETE /api/keys/:id — revoke an API key
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await db('api_keys')
      .where('id', req.params.id as string)
      .where('user_id', req.user!.id)
      .delete();

    if (!deleted) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete key error:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export default router;
