#!/usr/bin/env node

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
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

// Track active transports for cleanup
const activeTransports = new Map<string, SSEServerTransport>();

// SSE endpoint for MCP
app.get('/sse', authenticate, async (req: Request, res: Response) => {
  console.log('New SSE connection');

  // Create MCP server and transport
  const mcpServer = createServer();
  const transport = new SSEServerTransport('/messages', res);

  // Store transport for cleanup
  const connectionId = Math.random().toString(36).substring(7);
  activeTransports.set(connectionId, transport);

  // Clean up on disconnect
  res.on('close', () => {
    console.log('SSE connection closed');
    activeTransports.delete(connectionId);
  });

  // Connect transport to server
  await mcpServer.connect(transport);
});

// Messages endpoint for client-to-server communication
app.post('/messages', authenticate, async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    res.status(400).json({ error: 'Missing sessionId parameter' });
    return;
  }

  // Find the transport for this session
  // The SSEServerTransport handles routing internally based on sessionId
  // We need to find the right transport and forward the message

  // For now, broadcast to all transports (simple approach)
  // In production, you'd want proper session management
  for (const transport of activeTransports.values()) {
    try {
      await transport.handlePostMessage(req, res);
      return;
    } catch {
      // Try next transport
    }
  }

  res.status(404).json({ error: 'Session not found' });
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
    console.log(`SSE endpoint: http://${host}:${port}/sse`);
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
