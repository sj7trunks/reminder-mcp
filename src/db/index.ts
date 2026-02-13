import Knex from 'knex';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createKnexInstance() {
  if (config.database.type === 'postgres' && config.database.url) {
    return Knex({
      client: 'pg',
      connection: config.database.url,
      pool: { min: 2, max: 10 },
    });
  }

  // SQLite - ensure data directory exists
  const dbPath = path.resolve(config.database.path);
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return Knex({
    client: 'better-sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true,
  });
}

export const db = createKnexInstance();

export async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');

  // Determine which extension to use based on what files exist
  const files = fs.readdirSync(migrationsDir);
  const hasJs = files.some(f => f.endsWith('.js') && !f.endsWith('.d.ts'));
  const hasTs = files.some(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));

  await db.migrate.latest({
    directory: migrationsDir,
    loadExtensions: hasJs ? ['.js'] : ['.ts'],
  });
}

export async function closeDatabase(): Promise<void> {
  await db.destroy();
}
