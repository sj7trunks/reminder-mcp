# CLAUDE.md - Development Guide

This file provides context for AI assistants working on this codebase.

## Project Overview

This is an MCP (Model Context Protocol) server that provides persistent memory, scheduled reminders, task tracking, and activity history. It's designed primarily for Poke (an iMessage bot) but works with any MCP-compatible client.

## Quick Commands

```bash
# Development
npm run dev          # stdio mode (for Claude Desktop)
npm run dev:http     # HTTP/SSE mode (for Poke)

# Production
npm run build        # Compile TypeScript
npm run start        # Run stdio mode
npm run start:http   # Run HTTP/SSE mode

# Database
npm run migrate      # Run database migrations

# Docker
docker-compose up -d # Run HTTP server in container
```

## Architecture

### Entry Points
- `src/index.ts` - stdio transport entry point (for Claude Desktop)
- `src/http.ts` - HTTP/SSE transport entry point (for Poke and remote clients)
- `src/server.ts` - Creates McpServer instance, registers all 14 tools

### Transport Modes

| Mode | File | Use Case | Auth |
|------|------|----------|------|
| stdio | `index.ts` | Local CLI tools (Claude Desktop) | None |
| HTTP/SSE | `http.ts` | Remote clients (Poke) | API Key via `Authorization: Bearer` header |

### Database Layer
- Uses Knex.js as query builder
- SQLite for development, PostgreSQL for production
- Migrations in `src/db/migrations/` (auto-detects .ts vs .js)
- Models define Zod schemas for validation

### Services
- `scheduler.ts` - Background polling (60s interval) for due reminders/tasks
- `notifier.ts` - Sends webhook notifications if `WEBHOOK_URL` is configured
- `timezone.ts` - Converts between timezones, parses relative times like "tomorrow at 2pm"

### Tools (14 total)
Each tool file exports:
1. Zod schemas for input validation
2. Handler functions that interact with the database
3. Activity logging for all mutations

**Important**: Handler functions must provide defaults for optional Zod fields since they may be called directly without Zod parsing:
```typescript
export async function listReminders(input: z.infer<typeof ListRemindersSchema>) {
  const status = input.status ?? 'pending';  // Provide default
  const limit = input.limit ?? 50;           // Provide default
  // ...
}
```

## Key Patterns

### Adding a New Tool

1. Create schema in the appropriate tool file:
```typescript
export const MyToolSchema = z.object({
  user_id: z.string(),
  // ... other fields
});
```

2. Create handler function (with inline defaults):
```typescript
export async function myTool(input: z.infer<typeof MyToolSchema>) {
  const optionalField = input.optionalField ?? 'default';
  // Implementation
  // Don't forget to log activity
  await db('activities').insert({...});
  return { success: true, ... };
}
```

3. Register in `server.ts`:
```typescript
server.tool(
  'my_tool',
  'Description of what it does',
  MyToolSchema.shape,
  async (args) => {
    const input = MyToolSchema.parse(args);
    const result = await myTool(input);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);
```

### Database Queries

Always use Knex query builder, not raw SQL:
```typescript
// Good
const rows = await db('reminders').where('user_id', userId).where('status', 'pending');

// Avoid raw SQL unless necessary
```

### Activity Logging

All mutations should log to the activities table:
```typescript
await db('activities').insert({
  id: uuid(),
  user_id: input.user_id,
  type: 'reminder',  // reminder | memory | task | query
  action: 'created', // created | completed | triggered | recalled | deleted | etc.
  entity_id: entityId,
  metadata: JSON.stringify({ ... }),
  created_at: new Date().toISOString(),
});
```

### Timezone Handling

- Store all times as UTC in the database
- Convert to user timezone only for display
- Use `parseRelativeTime()` for natural language parsing
- Always validate timezones with `isValidTimezone()`

### API Key Authentication (HTTP mode)

The HTTP server uses Bearer token authentication:
```typescript
// Middleware checks Authorization header
const apiKey = req.headers.authorization?.slice(7); // Remove "Bearer "
if (apiKey !== config.server.apiKey) {
  res.status(401).json({ error: 'Unauthorized' });
}
```

## Database Schema

### reminders
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | VARCHAR | Index |
| title | TEXT | Required |
| description | TEXT | Optional |
| due_at | TIMESTAMP | UTC, indexed |
| timezone | VARCHAR | User's timezone |
| status | ENUM | pending/triggered/completed/cancelled |
| created_at | TIMESTAMP | |

### memories
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | VARCHAR | Index |
| content | TEXT | What to remember |
| tags | JSON | Array of strings |
| recalled_count | INT | Times recalled |
| created_at | TIMESTAMP | |

### tasks
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | VARCHAR | Index |
| title | TEXT | Task description |
| command | TEXT | Original prompt |
| status | ENUM | pending/in_progress/completed/failed |
| check_interval_ms | INT | Default 300000 (5 min) |
| last_check_at | TIMESTAMP | |
| next_check_at | TIMESTAMP | Indexed for polling |
| created_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |

### activities
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | VARCHAR | Index |
| type | ENUM | reminder/memory/task/query |
| action | VARCHAR | created/triggered/completed/etc |
| entity_id | UUID | FK to related entity |
| metadata | JSON | Additional context |
| created_at | TIMESTAMP | Indexed |

## Common Tasks

### Adding a New Migration

```bash
npm run migrate:make -- descriptive_name
```

Then edit the generated file in `src/db/migrations/`.

### Testing Tools Manually

```bash
# Test stdio mode
npx @modelcontextprotocol/inspector node dist/index.js

# Test HTTP mode
API_KEY=test-key npm run start:http
# Then curl http://localhost:3000/health
```

### Testing with the Test Script

```bash
npx tsx test-tools.ts
```

### Debugging

- Server logs to stderr (stdout is reserved for MCP protocol in stdio mode)
- Set `LOG_LEVEL=debug` in .env for verbose output
- Check `data/reminder.db` with any SQLite viewer
- Health endpoint: `GET /health` (no auth required)

## Deployment

### Docker

```bash
# Generate API key
export API_KEY=$(openssl rand -hex 32)

# Create .env
echo "API_KEY=$API_KEY" > .env

# Deploy
docker-compose up -d
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | Yes (HTTP) | - | Authentication key |
| `PORT` | No | 3000 | HTTP server port |
| `DATABASE_TYPE` | No | sqlite | sqlite or postgres |
| `DATABASE_PATH` | No | ./data/reminder.db | SQLite path |
| `DEFAULT_TIMEZONE` | No | America/Los_Angeles | Default TZ |

## Error Handling

- Tool handlers should return `{ success: false, error: "message" }` for expected errors
- Zod validation errors are automatically handled by the MCP SDK
- Database errors should be caught and returned as user-friendly messages

## Testing Checklist

Before deploying changes:
1. [ ] `npm run build` succeeds without errors
2. [ ] `npx tsx test-tools.ts` passes
3. [ ] Migrations run cleanly on fresh database
4. [ ] Test modified tools with MCP Inspector
5. [ ] Verify activity logging works
6. [ ] Test HTTP mode with API key auth
7. [ ] Check timezone handling with various inputs
