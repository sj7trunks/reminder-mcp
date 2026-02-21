import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/teams — list user's teams
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teams = await db('teams')
      .join('team_memberships', 'teams.id', 'team_memberships.team_id')
      .where('team_memberships.user_id', req.user!.id)
      .select('teams.*', 'team_memberships.role as my_role')
      .orderBy('teams.created_at', 'desc');

    res.json(teams);
  } catch (error) {
    console.error('List teams error:', error);
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

// POST /api/teams — create team
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Team name is required' });
      return;
    }

    const id = uuid();
    const now = new Date().toISOString();

    await db.transaction(async (trx) => {
      await trx('teams').insert({
        id,
        name: name.trim(),
        created_by: req.user!.id,
        created_at: now,
        updated_at: now,
      });

      // Auto-add creator as admin member
      await trx('team_memberships').insert({
        user_id: req.user!.id,
        team_id: id,
        role: 'admin',
        created_at: now,
      });
    });

    const team = await db('teams').where('id', id).first();
    res.status(201).json({ ...team, my_role: 'admin' });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// GET /api/teams/:id — team details + members
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = req.params.id as string;

    // Check membership
    const membership = await db('team_memberships')
      .where({ user_id: req.user!.id, team_id: teamId })
      .first();

    if (!membership) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const team = await db('teams').where('id', teamId).first();
    const members = await db('team_memberships')
      .join('users', 'team_memberships.user_id', 'users.id')
      .where('team_memberships.team_id', teamId)
      .select(
        'users.id',
        'users.email',
        'users.name',
        'team_memberships.role',
        'team_memberships.created_at'
      )
      .orderBy('team_memberships.created_at', 'asc');

    res.json({ ...team, members, my_role: membership.role as string });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Failed to get team' });
  }
});

// PATCH /api/teams/:id — update team name
router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = req.params.id as string;

    // Check team admin
    const membership = await db('team_memberships')
      .where({ user_id: req.user!.id, team_id: teamId })
      .first();

    if (!membership || (membership.role as string) !== 'admin') {
      res.status(403).json({ error: 'Team admin access required' });
      return;
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Team name is required' });
      return;
    }

    await db('teams').where('id', teamId).update({
      name: name.trim(),
      updated_at: new Date().toISOString(),
    });

    const team = await db('teams').where('id', teamId).first();
    res.json(team);
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// DELETE /api/teams/:id — delete team
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = req.params.id as string;

    const membership = await db('team_memberships')
      .where({ user_id: req.user!.id, team_id: teamId })
      .first();

    if (!membership || (membership.role as string) !== 'admin') {
      res.status(403).json({ error: 'Team admin access required' });
      return;
    }

    await db('teams').where('id', teamId).delete();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// POST /api/teams/:id/members — add member by email
router.post('/:id/members', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = req.params.id as string;

    const membership = await db('team_memberships')
      .where({ user_id: req.user!.id, team_id: teamId })
      .first();

    if (!membership || (membership.role as string) !== 'admin') {
      res.status(403).json({ error: 'Team admin access required' });
      return;
    }

    const { email, role } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const user = await db('users').where('email', email).first();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const existing = await db('team_memberships')
      .where({ user_id: user.id as string, team_id: teamId })
      .first();

    if (existing) {
      res.status(409).json({ error: 'User is already a team member' });
      return;
    }

    const now = new Date().toISOString();
    await db('team_memberships').insert({
      user_id: user.id as string,
      team_id: teamId,
      role: role === 'admin' ? 'admin' : 'member',
      created_at: now,
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: role === 'admin' ? 'admin' : 'member',
      created_at: now,
    });
  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// PATCH /api/teams/:id/members/:userId — update member role
router.patch('/:id/members/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = req.params.id as string;
    const targetUserId = req.params.userId as string;

    const membership = await db('team_memberships')
      .where({ user_id: req.user!.id, team_id: teamId })
      .first();

    if (!membership || (membership.role as string) !== 'admin') {
      res.status(403).json({ error: 'Team admin access required' });
      return;
    }

    const { role } = req.body;
    if (role !== 'admin' && role !== 'member') {
      res.status(400).json({ error: 'Role must be admin or member' });
      return;
    }

    const updated = await db('team_memberships')
      .where({ user_id: targetUserId, team_id: teamId })
      .update({ role });

    if (!updated) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update team member error:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// DELETE /api/teams/:id/members/:userId — remove member
router.delete('/:id/members/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const teamId = req.params.id as string;
    const targetUserId = req.params.userId as string;

    // Admin can remove anyone; members can only remove themselves
    const membership = await db('team_memberships')
      .where({ user_id: req.user!.id, team_id: teamId })
      .first();

    if (!membership) {
      res.status(403).json({ error: 'Not a team member' });
      return;
    }

    const isAdmin = (membership.role as string) === 'admin';
    const isSelf = targetUserId === req.user!.id;

    if (!isAdmin && !isSelf) {
      res.status(403).json({ error: 'Team admin access required' });
      return;
    }

    const deleted = await db('team_memberships')
      .where({ user_id: targetUserId, team_id: teamId })
      .delete();

    if (!deleted) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

export default router;
