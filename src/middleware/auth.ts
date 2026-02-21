import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import type { User } from '../db/models/User.js';
import type { McpContext } from '../types/context.js';

export interface AuthRequest extends Request {
  user?: User;
  mcpContext?: McpContext;
}

const SECRET_KEY = () => config.server.secretKey || 'development-secret-key';

// Verify JWT token
export function verifyToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, SECRET_KEY()) as { userId: string };
    return decoded;
  } catch {
    return null;
  }
}

// Generate JWT token
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, SECRET_KEY(), { expiresIn: '7d' });
}

// Middleware: Require JWT authentication (for web frontend)
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  // Check cookie first
  let token = req.cookies?.token;

  // Then check Authorization header
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  db('users').where('id', decoded.userId).first()
    .then((row: Record<string, unknown> | undefined) => {
      if (!row) {
        res.status(401).json({ error: 'User not found' });
        return;
      }
      req.user = {
        id: row.id as string,
        email: row.email as string,
        name: (row.name as string) || null,
        password_hash: (row.password_hash as string) || null,
        is_admin: row.is_admin === true || row.is_admin === 1,
        created_at: new Date(row.created_at as string),
        updated_at: new Date(row.updated_at as string),
      };
      next();
    })
    .catch(() => {
      res.status(500).json({ error: 'Authentication failed' });
    });
}

// Middleware: Require API key authentication (for MCP clients)
export function requireApiKey(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.query.api_key as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  // Hash the incoming key and look up in api_keys
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  db('api_keys').where('key_hash', keyHash).first()
    .then((keyRecord: Record<string, unknown> | undefined) => {
      if (!keyRecord) {
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }

      return db('users').where('id', keyRecord.user_id as string).first()
        .then((row: Record<string, unknown> | undefined) => {
          if (!row) {
            res.status(401).json({ error: 'User not found' });
            return;
          }
          req.user = {
            id: row.id as string,
            email: row.email as string,
            name: (row.name as string) || null,
            password_hash: (row.password_hash as string) || null,
            is_admin: row.is_admin === true || row.is_admin === 1,
            created_at: new Date(row.created_at as string),
            updated_at: new Date(row.updated_at as string),
          };

          // Build McpContext from API key record
          const scopeType = (keyRecord.scope_type as string) === 'team' ? 'team' : 'user';
          req.mcpContext = {
            userId: row.id as string,
            scopeType: scopeType as 'user' | 'team',
            teamId: scopeType === 'team' ? (keyRecord.team_id as string) : undefined,
            isAdmin: row.is_admin === true || row.is_admin === 1,
          };

          next();
        });
    })
    .catch(() => {
      res.status(500).json({ error: 'Authentication failed' });
    });
}

// Middleware: Require admin role
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || !req.user.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// Middleware: Authentik forward auth auto-login
export function authentikAutoLogin(req: AuthRequest, res: Response, next: NextFunction): void {
  // In development, default to local auth flows unless explicitly overridden.
  if (process.env.NODE_ENV !== 'production' && process.env.AUTHENTIK_IN_DEV !== 'true') {
    next();
    return;
  }

  const authentikEmail = req.headers['x-authentik-email'] as string;
  if (!authentikEmail) {
    next();
    return;
  }

  // If user already has a valid JWT cookie, skip auto-login
  const existingToken = req.cookies?.token;
  if (existingToken) {
    const decoded = verifyToken(existingToken);
    if (decoded) {
      next();
      return;
    }
  }

  // Auto-create or find the user, then set JWT cookie
  db('users').where('email', authentikEmail).first()
    .then(async (row: Record<string, unknown> | undefined) => {
      let userId: string;

      if (!row) {
        // Create new user from Authentik headers
        const authentikName = req.headers['x-authentik-name'] as string || null;
        userId = crypto.randomUUID();
        const now = new Date().toISOString();

        // Check if this is the first user (auto-promote to admin)
        const existingUsers = await db('users').select('id').limit(1);
        const isFirst = existingUsers.length === 0;

        await db('users').insert({
          id: userId,
          email: authentikEmail,
          name: authentikName,
          password_hash: null,
          is_admin: isFirst,
          created_at: now,
          updated_at: now,
        });
      } else {
        userId = row.id as string;
      }

      const token = generateToken(userId);
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Also inject the token into req.cookies so that requireAuth
      // can see it on this same request (the Set-Cookie header only
      // reaches the browser on the response — it's not in req.cookies yet).
      if (!req.cookies) req.cookies = {};
      req.cookies.token = token;

      next();
    })
    .catch((err: Error) => {
      console.error('Authentik auto-login error:', err);
      next();
    });
}
