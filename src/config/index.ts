import { z } from 'zod';

const configSchema = z.object({
  database: z.object({
    type: z.enum(['sqlite', 'postgres']).default('sqlite'),
    path: z.string().default('./data/reminder.db'),
    url: z.string().optional(),
  }),
  redis: z.object({
    url: z.string().optional(),
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
  return configSchema.parse({
    database: {
      type: process.env.DATABASE_TYPE || 'sqlite',
      path: process.env.DATABASE_PATH || './data/reminder.db',
      url: process.env.DATABASE_URL,
    },
    redis: {
      url: process.env.REDIS_URL,
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
