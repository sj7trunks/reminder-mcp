#!/usr/bin/env node

import { runMigrations, closeDatabase, db } from '../db/index.js';
import { config } from '../config/index.js';
import { processMemoryEmbedding } from '../services/embedding-worker.js';

const BATCH_SIZE = 100;

async function main(): Promise<void> {
  if (config.database.type !== 'postgres') {
    console.log('Backfill skipped: embeddings are only supported in PostgreSQL mode.');
    return;
  }

  await runMigrations();

  let processed = 0;
  let failed = 0;

  while (true) {
    const rows = await db('memories')
      .select('id', 'content')
      .whereNull('embedding')
      .orderBy('created_at', 'asc')
      .limit(BATCH_SIZE);

    if (rows.length === 0) {
      break;
    }

    console.log(`Processing batch size=${rows.length}`);

    for (const row of rows) {
      const id = row.id as string;
      const content = row.content as string;

      try {
        await db('memories').where('id', id).update({ embedding_status: 'pending', embedding_error: null });
        await processMemoryEmbedding(id, content);
        processed += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Unknown error';
        await db('memories').where('id', id).update({
          embedding_status: 'failed',
          embedding_error: message,
        });
        console.error(`Failed memory ${id}: ${message}`);
      }
    }

    console.log(`Progress processed=${processed} failed=${failed}`);
  }

  console.log(`Backfill complete processed=${processed} failed=${failed}`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
