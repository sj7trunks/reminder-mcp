import { Router, raw } from 'express';
import { createGzip, gunzipSync } from 'zlib';
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { db } from '../db/index.js';

const router = Router();

// GET /api/admin/users — list all users with stats
router.get('/users', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const users = await db('users')
      .select('id', 'email', 'name', 'is_admin', 'created_at', 'updated_at')
      .orderBy('created_at', 'asc');

    // Enrich with counts
    const enriched = await Promise.all(
      users.map(async (user: Record<string, unknown>) => {
        const [reminders, memories, tasks] = await Promise.all([
          db('reminders').where('user_id', user.id as string).count('id as count').first(),
          db('memories').where('user_id', user.id as string).count('id as count').first(),
          db('tasks').where('user_id', user.id as string).count('id as count').first(),
        ]);
        return {
          ...user,
          is_admin: user.is_admin === true || user.is_admin === 1,
          reminder_count: Number(reminders?.count || 0),
          memory_count: Number(memories?.count || 0),
          task_count: Number(tasks?.count || 0),
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// PATCH /api/admin/users/:id — update user (toggle admin, etc.)
router.patch('/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { is_admin } = req.body;
    const targetId = req.params.id as string;

    // Prevent self-demotion
    if (targetId === req.user!.id && is_admin === false) {
      res.status(400).json({ error: 'Cannot remove your own admin status' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (typeof is_admin === 'boolean') {
      updates.is_admin = is_admin;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    updates.updated_at = new Date().toISOString();

    const updated = await db('users').where('id', targetId).update(updates);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = await db('users')
      .where('id', targetId)
      .select('id', 'email', 'name', 'is_admin', 'created_at', 'updated_at')
      .first();

    res.json(user);
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Data tables to include in backup (order matters for foreign keys on restore)
const BACKUP_TABLES = ['users', 'teams', 'team_memberships', 'api_keys', 'reminders', 'memories', 'tasks', 'activities', 'applications'] as const;

// GET /api/admin/backup — download full database as gzipped JSON
router.get('/backup', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const data: Record<string, unknown[]> = {};

    for (const table of BACKUP_TABLES) {
      data[table] = await db(table).select('*');
    }

    const payload = JSON.stringify({
      version: 1,
      created_at: new Date().toISOString(),
      tables: data,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="reminder-mcp-backup-${timestamp}.json.gz"`);

    const gzip = createGzip();
    gzip.pipe(res);
    gzip.end(payload);
  } catch (error) {
    console.error('Backup error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Backup failed' });
    }
  }
});

// POST /api/admin/restore — restore database from gzipped JSON backup
router.post(
  '/restore',
  requireAuth,
  requireAdmin,
  raw({ type: 'application/gzip', limit: '100mb' }),
  async (req: AuthRequest, res) => {
    try {
      if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'No backup file provided. Upload a .json.gz file.' });
        return;
      }

      // Decompress and parse
      let parsed: { version?: number; tables?: Record<string, unknown[]> };
      try {
        const json = gunzipSync(req.body).toString('utf-8');
        parsed = JSON.parse(json);
      } catch {
        res.status(400).json({ error: 'Invalid backup file. Must be a valid gzipped JSON.' });
        return;
      }

      if (!parsed.tables || parsed.version !== 1) {
        res.status(400).json({ error: 'Unrecognized backup format.' });
        return;
      }

      const tables = parsed.tables;
      const stats: Record<string, number> = {};

      // Restore inside a transaction — delete in reverse order, insert in forward order
      await db.transaction(async (trx) => {
        // Delete existing data (reverse order for foreign keys)
        for (const table of [...BACKUP_TABLES].reverse()) {
          await trx(table).del();
        }

        // Insert backup data (forward order)
        for (const table of BACKUP_TABLES) {
          const rows = tables[table];
          if (rows && rows.length > 0) {
            // Insert in batches of 500 for large tables
            for (let i = 0; i < rows.length; i += 500) {
              await trx(table).insert(rows.slice(i, i + 500));
            }
          }
          stats[table] = rows?.length || 0;
        }
      });

      console.log('Restore complete:', stats);
      res.json({ success: true, stats });
    } catch (error) {
      console.error('Restore error:', error);
      res.status(500).json({ error: 'Restore failed: ' + (error instanceof Error ? error.message : 'unknown error') });
    }
  }
);

export default router;
