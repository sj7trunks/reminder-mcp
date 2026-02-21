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
      .select('id', 'prefix', 'name', 'scope_type', 'team_id', 'created_at')
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
    const { name, scope_type, team_id } = req.body;
    const keyScope = scope_type === 'team' ? 'team' : 'user';

    // Validate team key requirements
    if (keyScope === 'team') {
      if (!team_id) {
        res.status(400).json({ error: 'team_id is required for team-scoped keys' });
        return;
      }

      // Verify user is a team admin
      const membership = await db('team_memberships')
        .where({ user_id: req.user!.id, team_id })
        .first();

      if (!membership || (membership.role as string) !== 'admin') {
        res.status(403).json({ error: 'Team admin access required to create team keys' });
        return;
      }
    }

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
      scope_type: keyScope,
      team_id: keyScope === 'team' ? team_id : null,
      created_at: now,
    });

    // Return the full key only on creation (never stored in plaintext)
    res.status(201).json({
      id,
      key: rawKey,
      prefix,
      name: name || 'default',
      scope_type: keyScope,
      team_id: keyScope === 'team' ? team_id : null,
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
