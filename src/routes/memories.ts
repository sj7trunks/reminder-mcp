import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { remember, recall, forget, promoteMemory, listScopes } from '../tools/memory.js';
import { db } from '../db/index.js';
import type { McpContext } from '../types/context.js';

const router = Router();

/** Build McpContext from the authenticated web user */
function webContext(req: AuthRequest): McpContext {
  return {
    userId: req.user!.id,
    scopeType: 'user',
    isAdmin: req.user!.is_admin,
  };
}

// GET /api/memories/chats — list user's chats (must be before /:id)
router.get('/chats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db('chats')
      .where('user_id', req.user!.id)
      .select('id', 'created_at')
      .orderBy('created_at', 'desc');
    res.json({ chats: rows });
  } catch (error) {
    console.error('List chats error:', error);
    res.status(500).json({ error: 'Failed to list chats' });
  }
});

// GET /api/memories/scopes — list available scopes (must be before /:id)
router.get('/scopes', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await listScopes({ user_id: req.user!.id });
    res.json(result);
  } catch (error) {
    console.error('List scopes error:', error);
    res.status(500).json({ error: 'Failed to list scopes' });
  }
});

// GET /api/memories — search/list memories
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const query = req.query.query as string | undefined;
    const tags = req.query.tags as string | undefined;
    const scope = req.query.scope as string | undefined;
    const scopeId = req.query.scope_id as string | undefined;
    const chatId = req.query.chat_id as string | undefined;
    const embeddingStatusRaw = req.query.embedding_status as string | undefined;
    const embeddingStatus = embeddingStatusRaw === 'pending'
      || embeddingStatusRaw === 'completed'
      || embeddingStatusRaw === 'failed'
      ? embeddingStatusRaw
      : undefined;
    const limit = req.query.limit as string | undefined;
    const parsedTags = tags ? tags.split(',') : undefined;

    const validScopes = ['personal', 'team', 'application', 'global'] as const;
    const parsedScope = validScopes.includes(scope as typeof validScopes[number])
      ? (scope as typeof validScopes[number])
      : undefined;

    const result = await recall({
      user_id: req.user!.id,
      query,
      tags: parsedTags,
      embedding_status: embeddingStatus,
      limit: Number(limit) || 50,
      scope: parsedScope,
      scope_id: scopeId,
      chat_id: chatId,
    }, webContext(req));
    res.json(result);
  } catch (error) {
    console.error('List memories error:', error);
    res.status(500).json({ error: 'Failed to list memories' });
  }
});

// POST /api/memories — store a new memory
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { content, tags, scope, scope_id, classification, chat_id } = req.body;
    const result = await remember({
      user_id: req.user!.id,
      content,
      tags: tags || [],
      scope,
      scope_id,
      classification,
      chat_id,
    }, webContext(req));

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

// POST /api/memories/:id/promote — promote a memory to a different scope
router.post('/:id/promote', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { target_scope, target_scope_id } = req.body;
    const result = await promoteMemory({
      user_id: req.user!.id,
      memory_id: req.params.id as string,
      target_scope,
      target_scope_id,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('Promote memory error:', error);
    res.status(500).json({ error: 'Failed to promote memory' });
  }
});

// DELETE /api/memories/:id — forget a memory
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await forget({
      memory_id: req.params.id as string,
      user_id: req.user!.id,
    }, webContext(req));

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
