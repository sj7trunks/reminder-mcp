#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { runMigrations, closeDatabase } from './db/index.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

async function main(): Promise<void> {
  // Run database migrations
  console.error('Running database migrations...');
  await runMigrations();
  console.error('Migrations complete');

  // Create MCP server (stdio mode uses 'owner' as default user for backward compatibility)
  const server = createServer('owner');

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Start background scheduler (checks every minute)
  startScheduler(60000);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    stopScheduler();
    await closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('Shutting down...');
    stopScheduler();
    await closeDatabase();
    process.exit(0);
  });

  // Connect transport to server
  console.error('Starting reminder-mcp server...');
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
