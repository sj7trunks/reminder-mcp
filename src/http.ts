#!/usr/bin/env node

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { runMigrations, closeDatabase } from './db/index.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { config } from './config/index.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Key authentication middleware
function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (!config.server.apiKey) {
    // No API key configured, allow all requests
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const apiKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.query.api_key as string;

  if (!apiKey || apiKey !== config.server.apiKey) {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    return;
  }

  next();
}

// Health check endpoint (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Streamable HTTP MCP endpoint (stateless - new server per request)
app.post('/mcp', authenticate, async (req: Request, res: Response) => {
  const server = createServer();

  try {
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

async function main(): Promise<void> {
  // Run database migrations
  console.log('Running database migrations...');
  await runMigrations();
  console.log('Migrations complete');

  // Start background scheduler (checks every minute)
  startScheduler(60000);

  // Handle shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    stopScheduler();
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
    if (config.server.apiKey) {
      console.log('API key authentication enabled');
    } else {
      console.log('WARNING: No API key configured - server is open');
    }
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
