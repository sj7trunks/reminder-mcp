#!/usr/bin/env node

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { runMigrations, closeDatabase } from './db/index.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { startEmbeddingWorker, stopEmbeddingWorker } from './services/embedding-worker.js';
import { config } from './config/index.js';
import { requireApiKey, authentikAutoLogin, type AuthRequest } from './middleware/auth.js';

// Import routes
import authRoutes from './routes/auth.js';
import keysRoutes from './routes/keys.js';
import remindersRoutes from './routes/reminders.js';
import memoriesRoutes from './routes/memories.js';
import tasksRoutes from './routes/tasks.js';
import statsRoutes from './routes/stats.js';
import adminRoutes from './routes/admin.js';
import teamsRoutes from './routes/teams.js';
import applicationsRoutes from './routes/applications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Health check endpoint (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Log incoming MCP requests for debugging
app.use('/mcp', (req: Request, _res: Response, next: NextFunction) => {
  if (req.method === 'POST' && req.body) {
    const body = req.body;
    const method = body.method || '(batch)';
    if (method === 'tools/call') {
      console.log(`[MCP] tools/call → ${body.params?.name}`, JSON.stringify(body.params?.arguments));
    } else {
      console.log(`[MCP] ${method}`);
    }
  }
  next();
});

// Streamable HTTP MCP endpoint (stateless - new server per request)
app.post('/mcp', requireApiKey, async (req: AuthRequest, res: Response) => {
  const server = createServer(req.user!.id, req.mcpContext);

  try {
    // Ensure Accept header includes required types for Streamable HTTP transport
    // Some MCP clients (like Poke) don't send these headers by default
    const accept = req.headers.accept || req.get('accept') || '';

    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
      // Modify headers at multiple levels to ensure the transport sees the correct value
      const requiredAccept = 'application/json, text/event-stream';

      // 1. Modify Express headers object
      req.headers.accept = requiredAccept;

      // 2. Override req.get() method
      const originalGet = req.get.bind(req);
      req.get = function(name: string): string | undefined {
        if (name.toLowerCase() === 'accept') {
          return requiredAccept;
        }
        return originalGet(name);
      };

      // 3. Override req.header() method (alias for get)
      req.header = req.get;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// GET and DELETE on /mcp not supported in stateless mode
app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.',
    },
    id: null,
  });
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed.',
    },
    id: null,
  });
});

// Authentik auto-login middleware — runs globally so that the JWT cookie
// gets set on the very first page load (e.g. GET /).  If no X-authentik-email
// header is present (MCP clients, local dev) it's a no-op.
app.use(authentikAutoLogin);

// REST API routes
app.use('/api/auth', authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/reminders', remindersRoutes);
app.use('/api/memories', memoriesRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/applications', applicationsRoutes);

// Static file serving for production (React SPA)
if (process.env.NODE_ENV === 'production') {
  const frontendDir = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDir));

  // Pre-build SPA fallback HTML with injected config
  const indexPath = path.join(frontendDir, 'index.html');
  let indexHtml: string | null = null;
  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const authentikHost = config.authentik.host;
    const logoutUrl = authentikHost
      ? `${authentikHost}/application/o/reminder-mcp/end-session/`
      : '';
    indexHtml = raw.replace(
      '</head>',
      `<script>window.__AUTHENTIK_LOGOUT_URL__ = "${logoutUrl}";</script></head>`
    );
  } catch {
    // Will fall back to sendFile below
  }

  // SPA fallback (Express 5 requires named catch-all)
  app.get('{*path}', (_req, res) => {
    if (indexHtml) {
      res.setHeader('Content-Type', 'text/html');
      res.send(indexHtml);
    } else {
      res.sendFile(indexPath);
    }
  });
}

async function main(): Promise<void> {
  // Run database migrations
  console.log('Running database migrations...');
  await runMigrations();
  console.log('Migrations complete');

  // Start background scheduler (checks every minute)
  startScheduler(60000);
  startEmbeddingWorker();

  // Handle shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    stopScheduler();
    await stopEmbeddingWorker();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start HTTP server
  const { port, host } = config.server;
  app.listen(port, host, () => {
    console.log(`Reminder MCP server running at http://${host}:${port}`);
    console.log(`MCP endpoint: http://${host}:${port}/mcp`);
    console.log(`API endpoint: http://${host}:${port}/api`);
    if (process.env.NODE_ENV === 'production') {
      console.log('Serving frontend from frontend/dist');
    }
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
