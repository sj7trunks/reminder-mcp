import type { Knex } from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: Record<string, Knex.Config> = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(__dirname, 'data', 'reminder.db'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'src', 'db', 'migrations'),
      extension: 'ts',
    },
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: path.join(__dirname, 'dist', 'db', 'migrations'),
    },
  },
};

export default config;
