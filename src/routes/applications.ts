import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/applications — list apps user has access to
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Apps the user created directly
    const ownedApps = await db('applications')
      .where('created_by', userId)
      .select('*');

    // Apps under teams the user belongs to
    const teamApps = await db('applications')
      .join('team_memberships', 'applications.team_id', 'team_memberships.team_id')
      .where('team_memberships.user_id', userId)
      .whereNotNull('applications.team_id')
      .select('applications.*');

    // Merge and deduplicate
    const seen = new Set<string>();
    const apps = [];
    for (const app of [...ownedApps, ...teamApps]) {
      const id = app.id as string;
      if (!seen.has(id)) {
        seen.add(id);
        apps.push(app);
      }
    }

    res.json(apps);
  } catch (error) {
    console.error('List applications error:', error);
    res.status(500).json({ error: 'Failed to list applications' });
  }
});

// POST /api/applications — create app
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, team_id } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Application name is required' });
      return;
    }

    // If team_id provided, verify user is a member
    if (team_id) {
      const membership = await db('team_memberships')
        .where({ user_id: req.user!.id, team_id })
        .first();

      if (!membership) {
        res.status(403).json({ error: 'Not a member of the specified team' });
        return;
      }
    }

    const id = uuid();
    const now = new Date().toISOString();

    await db('applications').insert({
      id,
      name: name.trim(),
      team_id: team_id || null,
      created_by: req.user!.id,
      created_at: now,
      updated_at: now,
    });

    const app = await db('applications').where('id', id).first();
    res.status(201).json(app);
  } catch (error) {
    console.error('Create application error:', error);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

// GET /api/applications/:id — app details
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const appId = req.params.id as string;
    const app = await db('applications').where('id', appId).first();

    if (!app) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    // Check access: owner or team member
    const isOwner = (app.created_by as string) === req.user!.id;
    let hasTeamAccess = false;

    if (app.team_id) {
      const membership = await db('team_memberships')
        .where({ user_id: req.user!.id, team_id: app.team_id as string })
        .first();
      hasTeamAccess = !!membership;
    }

    if (!isOwner && !hasTeamAccess) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    res.json(app);
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({ error: 'Failed to get application' });
  }
});

// PATCH /api/applications/:id — update app
router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const appId = req.params.id as string;
    const app = await db('applications').where('id', appId).first();

    if (!app) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    // Check: owner or team admin
    const isOwner = (app.created_by as string) === req.user!.id;
    let isTeamAdmin = false;

    if (app.team_id) {
      const membership = await db('team_memberships')
        .where({ user_id: req.user!.id, team_id: app.team_id as string })
        .first();
      isTeamAdmin = !!membership && (membership.role as string) === 'admin';
    }

    if (!isOwner && !isTeamAdmin) {
      res.status(403).json({ error: 'Not authorized to update this application' });
      return;
    }

    const { name } = req.body;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name && typeof name === 'string' && name.trim()) {
      updates.name = name.trim();
    }

    await db('applications').where('id', appId).update(updates);
    const updated = await db('applications').where('id', appId).first();
    res.json(updated);
  } catch (error) {
    console.error('Update application error:', error);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// DELETE /api/applications/:id — delete app
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const appId = req.params.id as string;
    const app = await db('applications').where('id', appId).first();

    if (!app) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const isOwner = (app.created_by as string) === req.user!.id;
    let isTeamAdmin = false;

    if (app.team_id) {
      const membership = await db('team_memberships')
        .where({ user_id: req.user!.id, team_id: app.team_id as string })
        .first();
      isTeamAdmin = !!membership && (membership.role as string) === 'admin';
    }

    if (!isOwner && !isTeamAdmin) {
      res.status(403).json({ error: 'Not authorized to delete this application' });
      return;
    }

    await db('applications').where('id', appId).delete();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

export default router;
