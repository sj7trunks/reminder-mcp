import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { requireAuth, generateToken, type AuthRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    // Check if user already exists (case-insensitive email match)
    const existing = await db('users')
      .whereRaw('LOWER(email) = ?', [normalizedEmail])
      .first();

    if (existing) {
      // If account exists without a local password (e.g. SSO-created),
      // allow setting a password via registration.
      if (!existing.password_hash) {
        const now = new Date().toISOString();
        const passwordHash = await bcrypt.hash(password, 10);

        await db('users')
          .where('id', existing.id)
          .update({
            email: normalizedEmail,
            name: name || existing.name || null,
            password_hash: passwordHash,
            updated_at: now,
          });

        const token = generateToken(existing.id);
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({
          user: {
            id: existing.id,
            email: normalizedEmail,
            name: name || existing.name || null,
            is_admin: existing.is_admin === true || existing.is_admin === 1,
          },
        });
        return;
      }

      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const id = uuid();
    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(password, 10);

    // Check if first user (auto-promote to admin)
    const existingUsers = await db('users').select('id').limit(1);
    const isFirst = existingUsers.length === 0;

    await db('users').insert({
      id,
      email: normalizedEmail,
      name: name || null,
      password_hash: passwordHash,
      is_admin: isFirst,
      created_at: now,
      updated_at: now,
    });

    const token = generateToken(id);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      user: { id, email: normalizedEmail, name: name || null, is_admin: isFirst },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await db('users')
      .whereRaw('LOWER(email) = ?', [normalizedEmail])
      .first();
    if (!user || !user.password_hash) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken(user.id);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_admin: user.is_admin === true || user.is_admin === 1,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    is_admin: user.is_admin,
  });
});

export default router;
