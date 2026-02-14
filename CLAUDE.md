# CLAUDE.md - Development Guide

This file provides context for AI assistants working on this codebase.

## Project Overview

Multi-user MCP (Model Context Protocol) server with a React web frontend. Provides persistent memory, scheduled reminders, task tracking, and activity history. Designed primarily for Poke (an iMessage AI bot) but works with any MCP-compatible client. Includes a full web dashboard for managing data, API keys, and admin functions.

## Quick Commands

```bash
# Development
npm run dev          # stdio mode (for Claude Desktop)
npm run dev:http     # HTTP mode (for Poke)
cd frontend && npm run dev  # Frontend dev server (proxies to :3000)

# Production
npm run build        # Compile TypeScript
npm run start:http   # Run HTTP mode

# Docker
docker compose up -d # Run HTTP server in container
```

## Architecture

### Three Concerns, One Express App

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /mcp` | API key (Bearer token, SHA-256 hashed lookup) | MCP protocol for Poke and MCP clients |
| `/api/*` | JWT cookie | REST API for the React frontend |
| `/*` | Authentik forward auth (Traefik) | Static React SPA |

### Entry Points
- `src/index.ts` - stdio transport (Claude Desktop, local dev)
- `src/http.ts` - HTTP transport (Poke, web frontend, Docker)
- `src/server.ts` - `createServer(userId)` — creates per-request MCP server scoped to a user

### Multi-User Model
- `createServer(userId)` injects the authenticated user's ID into every tool call
- MCP clients never see or send `user_id` — it's injected server-side from the API key lookup
- All queries filter by `user_id` for data isolation
- First user to register or log in via Authentik is auto-promoted to admin

### Auth Flows
- **MCP clients**: `Authorization: Bearer <api-key>` → SHA-256 hash → lookup in `api_keys` table → resolve `user_id`
- **Web frontend**: JWT cookie set on login/register or Authentik auto-login → `requireAuth` middleware
- **Authentik SSO**: Traefik forwards `X-authentik-email` header → `authentikAutoLogin` middleware auto-creates user + sets JWT cookie

### Database Layer
- Knex.js query builder
- SQLite (`better-sqlite3`) for development
- PostgreSQL (`pg`) for production
- Migrations in `src/db/migrations/` (auto-detects .ts vs .js at runtime)
- Models use Zod schemas in `src/db/models/`

### Services
- `scheduler.ts` - Background polling (60s) for due reminders/tasks, triggers webhook notifications
- `notifier.ts` - Sends webhooks to Poke (`{"message": "..."}` with Bearer token)
- `timezone.ts` - Timezone conversion and relative time parsing

## Key Patterns

### Tool Handlers Accept `user_id` as Required Field
All tool schemas require `user_id: z.string()`. The MCP server injects this from the authenticated user — clients don't provide it. When calling handlers directly (e.g., from REST routes), pass the user ID explicitly.

### Handler Functions Must Provide Defaults for Optional Fields
Since handlers may be called directly without Zod parsing:
```typescript
export async function listReminders(input: z.infer<typeof ListRemindersSchema>) {
  const status = input.status ?? 'pending';
  const limit = input.limit ?? 50;
}
```

### Ownership Validation on Mutations
Single-entity operations (complete, cancel, delete) must verify ownership:
```typescript
const row = await db('reminders').where('id', input.reminder_id).where('user_id', input.user_id).first();
if (!row) return { success: false, error: 'Not found' };
```

### Activity Logging
All mutations log to the activities table for the dashboard timeline.

## Database Schema

### users
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| email | TEXT | Unique, not null |
| name | TEXT | Nullable |
| password_hash | TEXT | Nullable (null for SSO-only users) |
| is_admin | BOOLEAN | First user auto-promoted |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### api_keys
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK to users, ON DELETE CASCADE |
| key_hash | TEXT | SHA-256 hex hash, indexed |
| prefix | VARCHAR(8) | First 8 chars for UI display |
| name | TEXT | User-given label |
| created_at | TIMESTAMP | |

### reminders, memories, tasks, activities
See migration files in `src/db/migrations/` for full schemas. All have `user_id` foreign keys.

## REST API Routes

| Route File | Prefix | Auth | Purpose |
|------------|--------|------|---------|
| `routes/auth.ts` | `/api/auth` | Public (register/login) + JWT (me) | User registration, login, logout |
| `routes/keys.ts` | `/api/keys` | JWT | API key management (create, list, revoke) |
| `routes/reminders.ts` | `/api/reminders` | JWT | CRUD with date range queries |
| `routes/memories.ts` | `/api/memories` | JWT | CRUD with search and tag filtering |
| `routes/tasks.ts` | `/api/tasks` | JWT | CRUD operations |
| `routes/stats.ts` | `/api/stats` | JWT | Dashboard data, Recharts-formatted timeline |
| `routes/admin.ts` | `/api/admin` | JWT + Admin | User management, backup/restore |

### Admin Backup/Restore
- `GET /api/admin/backup` — Downloads all tables as `.json.gz` (gzipped JSON, Node built-in `zlib`)
- `POST /api/admin/restore` — Accepts `.json.gz` upload, replaces all data in a transaction

## Frontend

React 18 + TypeScript + Vite + Tailwind CSS + React Query + Recharts.

| Page | Purpose |
|------|---------|
| `Login.tsx` | Email/password + "Sign in with SSO" |
| `Register.tsx` | New account registration |
| `Dashboard.tsx` | Stat cards + 30-day activity chart |
| `Reminders.tsx` | Calendar grid with day-click to view/add |
| `Memories.tsx` | Searchable list with tag filters |
| `Settings.tsx` | API key management + theme toggle |
| `Admin.tsx` | User list with admin toggle, backup/restore |

Dark mode via `ThemeContext.tsx` — system preference + manual toggle + localStorage.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | - | Set `production` for static SPA serving |
| `API_KEY` | Yes (HTTP) | - | Legacy: used only in migration 008 for seeding |
| `SECRET_KEY` | Yes | `development-secret-key` | JWT signing secret |
| `AUTHENTIK_HOST` | No | - | Authentik base URL for SSO logout redirect |
| `DATABASE_TYPE` | No | `sqlite` | `sqlite` or `postgres` |
| `DATABASE_PATH` | No | `./data/reminder.db` | SQLite file path |
| `DATABASE_URL` | No | - | PostgreSQL connection string |
| `DEFAULT_TIMEZONE` | No | `America/Los_Angeles` | Default timezone |
| `WEBHOOK_URL` | No | - | Webhook for push notifications (Poke) |
| `WEBHOOK_API_KEY` | No | - | Bearer token for webhook auth |

## Docker

Multi-stage Dockerfile:
1. **frontend-builder** — `npm ci && npm run build` in `frontend/`
2. **server-builder** — `npm ci && npm run build` in root
3. **production** — Copy `dist/` + `frontend/dist/`, run `node dist/http.js`

Production image serves the SPA from `frontend/dist/` with injected Authentik logout URL.

## Known Pitfalls

### Express 5 Wildcard Routes
Express 5 uses `path-to-regexp` v8 which does NOT support bare `*` wildcards. Use `{*path}` instead:
```typescript
// WRONG — crashes at startup
app.get('*', handler);
// CORRECT
app.get('{*path}', handler);
```

### Express 5 Param Types
`req.params.id` returns `string | string[]` in Express 5. Always cast: `req.params.id as string`.

### Express 5 Query Types
`req.query.foo` returns `string | string[] | undefined`. Use explicit casts: `req.query.foo as string | undefined`.

### Authentik Cookie Timing
When `authentikAutoLogin` sets a JWT cookie via `res.cookie()`, it's NOT available in `req.cookies` on the same request. Must also inject: `req.cookies.token = token`.

### Authentik Middleware Placement
`authentikAutoLogin` must run globally (`app.use(authentikAutoLogin)`) BEFORE route handlers, not scoped to `/api`. Otherwise the first page load to `/` won't set the JWT cookie.

### Traefik Priority Routing
- **Priority 200**: `/mcp`, `/health`, `/api` — bypass Authentik forward auth (these handle their own auth)
- **Priority 100**: Everything else — Authentik forward auth for the SPA
If `/api` routes go through Authentik, login/register endpoints break and fetch calls get HTML redirects instead of JSON.

### Migration 008 on Fresh Databases
Migration 008 only seeds data when existing records exist (reminders/memories/tasks). On a fresh database it's a no-op, so the first user to register or SSO in becomes admin automatically.

### Knex Row Types
Knex returns `Record<string, unknown>` rows. Always cast fields: `row.id as string`, `row.is_admin === true || row.is_admin === 1` (SQLite returns 0/1, PostgreSQL returns boolean).

## Testing Checklist

Before deploying changes:
1. `npx tsc --noEmit` — backend compiles
2. `cd frontend && npx tsc --noEmit` — frontend compiles
3. `docker compose build` — Docker image builds
4. Migrations run cleanly on fresh database
5. Verify MCP endpoint with API key auth
6. Verify web frontend login flow
7. Test backup/restore round-trip
