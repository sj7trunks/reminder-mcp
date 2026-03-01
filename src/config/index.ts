import { z } from 'zod';

const configSchema = z.object({
  database: z.object({
    type: z.enum(['sqlite', 'postgres']).default('sqlite'),
    path: z.string().default('./data/reminder.db'),
    url: z.string().optional(),
  }),
  embedding: z.object({
    apiUrl: z.string().optional(),
    apiKey: z.string().optional(),
    model: z.string().default('text-embedding-3-small'),
    dimensions: z.number().default(1536),
  }),
  redis: z.object({
    url: z.string().optional(),
  }),
  openai: z.object({
    apiKey: z.string().optional(),
  }),
  webhook: z.object({
    url: z.string().optional(),
    apiKey: z.string().optional(),
  }),
  server: z.object({
    port: z.number().default(3000),
    host: z.string().default('0.0.0.0'),
    apiKey: z.string().optional(),
    secretKey: z.string().optional(),
  }),
  authentik: z.object({
    host: z.string().optional(),
  }),
  defaultTimezone: z.string().default('America/Los_Angeles'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const isProduction = process.env.NODE_ENV === 'production';
  const databaseType = isProduction ? (process.env.DATABASE_TYPE || 'sqlite') : 'sqlite';

  return configSchema.parse({
    database: {
      type: databaseType,
      path: process.env.DATABASE_PATH || './data/reminder.db',
      url: databaseType === 'postgres' ? process.env.DATABASE_URL : undefined,
    },
    embedding: {
      apiUrl: process.env.EMBEDDING_API_URL,
      apiKey: process.env.EMBEDDING_API_KEY,
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10),
    },
    redis: {
      url: process.env.REDIS_URL,
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },
    webhook: {
      url: process.env.WEBHOOK_URL,
      apiKey: process.env.WEBHOOK_API_KEY,
    },
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || '0.0.0.0',
      apiKey: process.env.API_KEY,
      secretKey: process.env.SECRET_KEY,
    },
    authentik: {
      host: process.env.AUTHENTIK_HOST,
    },
    defaultTimezone: process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles',
    logLevel: (process.env.LOG_LEVEL as Config['logLevel']) || 'info',
  });
}

export const config = loadConfig();
