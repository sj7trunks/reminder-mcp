# CLAUDE.md - Development Guide

This file provides context for AI assistants working on this codebase.

## Project Overview

Multi-user MCP (Model Context Protocol) server with a React web frontend. Provides persistent memory, scheduled reminders, task tracking, and activity history. Designed primarily for Poke (an iMessage AI bot) but works with any MCP-compatible client. Includes a full web dashboard for managing data, API keys, and admin functions. Supports **scoped memories** (personal, team, application, global), **teams**, and **applications** for shared knowledge across agents and team members.

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
- `src/server.ts` - `createServer(userId, context?)` — creates per-request MCP server scoped to a user with optional McpContext

### Multi-User Model
- `createServer(userId, context?)` injects the authenticated user's ID and scope context into every tool call
- MCP clients never see or send `user_id` — it's injected server-side from the API key lookup
- All queries filter by `user_id` for data isolation (personal scope) or by team/app membership (shared scopes)
- First user to register or log in via Authentik is auto-promoted to admin

### Auth Flows
- **MCP clients**: `Authorization: Bearer <api-key>` → SHA-256 hash → lookup in `api_keys` table → resolve `user_id` + `McpContext` (scope_type, team_id)
- **Web frontend**: JWT cookie set on login/register or Authentik auto-login → `requireAuth` middleware
- **Authentik SSO**: Traefik forwards `X-authentik-email` header → `authentikAutoLogin` middleware auto-creates user + sets JWT cookie

### Scoped Memories
Memories support four scopes:
- **personal** (default) — visible only to the owning user
- **team** — visible to all team members, requires `scope_id` = team UUID
- **application** — visible to app owner and team members (if app is under a team)
- **global** — visible to everyone, admin-only for writes

`McpContext` (`src/types/context.ts`) carries scope info through the request:
```typescript
interface McpContext {
  userId: string;
  scopeType: 'user' | 'team';
  teamId?: string;
  isAdmin?: boolean;
}
```

**API key scoping**: User keys default to personal scope. Team keys (scope_type='team') default to team scope. The context is built in `requireApiKey` middleware and passed to `createServer()`.

**Dedup on write**: When Postgres + OpenAI are configured, `remember()` generates an embedding before insert and checks for cosine similarity > 0.9 in the same scope. If a near-duplicate exists, the old memory gets `superseded_by` set to the new ID. The pre-computed embedding is stored directly (skipping the queue).

### Database Layer
- Knex.js query builder
- SQLite (`better-sqlite3`) for development
- PostgreSQL (`pg`) for production
- Migrations in `src/db/migrations/` (auto-detects .ts vs .js at runtime)
- Models use Zod schemas in `src/db/models/`

### Services
- `scheduler.ts` - Background polling (60s) for due reminders/tasks, triggers webhook notifications
- `notifier.ts` - Sends webhooks to Poke (`{"message": "..."}` with Bearer token) + delivers to dynamically registered webhooks
- `webhook-registry.ts` - In-memory webhook registry for dynamic webhook registration via MCP tools. Auto-unregisters after 3 consecutive failures. 10s delivery timeout.
- `timezone.ts` - Timezone conversion and relative time parsing
- `embedding.ts` - OpenAI text-embedding-3-small integration for semantic search
- `embedding-worker.ts` - Background worker for generating embeddings on new/updated memories

## Key Patterns

### Tool Handlers Accept `user_id` as Required Field
All tool schemas require `user_id: z.string()`. The MCP server injects this from the authenticated user — clients don't provide it. When calling handlers directly (e.g., from REST routes), pass the user ID explicitly.

### Memory Handlers Accept Optional `McpContext`
Memory tool functions (`remember`, `recall`, `forget`) accept an optional `McpContext` parameter for scope resolution and permission checks. REST routes build this from the authenticated user; MCP routes pass it from `req.mcpContext`.

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

For scoped memories, `forget()` checks scope-based permissions:
- **personal**: user_id match
- **team**: author_id match OR team admin
- **application**: author_id match OR team admin (if app has team)
- **global**: system admin only

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

### teams
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| name | TEXT | Not null |
| created_by | UUID | FK to users, CASCADE |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### team_memberships
| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID | Composite PK, FK to users CASCADE |
| team_id | UUID | Composite PK, FK to teams CASCADE |
| role | STRING(10) | 'admin' or 'member' |
| created_at | TIMESTAMP | |

### applications
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| name | TEXT | Not null |
| team_id | UUID | Nullable FK to teams, SET NULL |
| created_by | UUID | FK to users, CASCADE |
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
| scope_type | STRING(10) | 'user' (default) or 'team' |
| team_id | UUID | Nullable FK to teams, CASCADE |
| created_at | TIMESTAMP | |

### memories
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | STRING | Not null, indexed |
| content | TEXT | Not null |
| tags | JSON | Default '[]' |
| recalled_count | INTEGER | Default 0 |
| embedding | vector(1536) | Postgres only, nullable |
| embedding_status | STRING(20) | pending/completed/failed |
| scope | STRING(20) | personal/team/application/global, default 'personal' |
| scope_id | UUID | References team or application ID |
| author_id | UUID | FK to users — who created it |
| promoted_from | UUID | Source memory ID if promoted |
| superseded_by | UUID | Dedup chain pointer |
| retrieval_count | INTEGER | Default 0 |
| last_retrieved_at | TIMESTAMP | Nullable |
| classification | STRING(20) | foundational/tactical/observational |
| created_at | TIMESTAMP | |

### reminders, tasks, activities
See migration files in `src/db/migrations/` for full schemas. All have `user_id` foreign keys.

## REST API Routes

| Route File | Prefix | Auth | Purpose |
|------------|--------|------|---------|
| `routes/auth.ts` | `/api/auth` | Public (register/login) + JWT (me) | User registration, login, logout |
| `routes/keys.ts` | `/api/keys` | JWT | API key management (create with scope_type, list, revoke) |
| `routes/reminders.ts` | `/api/reminders` | JWT | CRUD with date range queries |
| `routes/memories.ts` | `/api/memories` | JWT | CRUD with search, tag, and scope filtering |
| `routes/tasks.ts` | `/api/tasks` | JWT | CRUD operations |
| `routes/stats.ts` | `/api/stats` | JWT | Dashboard data, Recharts-formatted timeline |
| `routes/admin.ts` | `/api/admin` | JWT + Admin | User management, backup/restore |
| `routes/teams.ts` | `/api/teams` | JWT | Team CRUD + member management |
| `routes/applications.ts` | `/api/applications` | JWT | Application CRUD |

### Memory-Specific Endpoints
- `GET /api/memories/scopes` — List available scopes (personal + user's teams/apps + global)
- `POST /api/memories/:id/promote` — Copy a memory to a different scope
- Scope filtering: `?scope=team&scope_id=<uuid>` on GET

### Admin Backup/Restore
- `GET /api/admin/backup` — Downloads all tables as `.json.gz` (gzipped JSON, Node built-in `zlib`)
- `POST /api/admin/restore` — Accepts `.json.gz` upload, replaces all data in a transaction
- Backup includes: users, teams, team_memberships, api_keys, reminders, memories, tasks, activities, applications

## MCP Tools

### Memory Tools
| Tool | Description |
|------|-------------|
| `remember` | Store a memory with optional scope, scope_id, classification |
| `recall` | Search memories across scopes with optional scope/scope_id filter |
| `forget` | Delete a memory (permission-checked by scope) |
| `promote_memory` | Copy a memory to a different scope |
| `list_scopes` | List all available scopes for the user |

### Webhook Tools
| Tool | Description |
|------|-------------|
| `register_webhook` | Register a URL to receive push notifications (with optional API key and event filter) |
| `unregister_webhook` | Remove a registered webhook URL |
| `list_webhooks` | List all registered webhooks for the user |

### Other Tools
| Tool | Description |
|------|-------------|
| `create_reminder` | Schedule a reminder |
| `list_reminders` | Get reminders with status filter |
| `complete_reminder` / `cancel_reminder` | Update reminder status |
| `start_task` / `check_task` / `list_tasks` / `complete_task` / `update_task` | Task tracking |
| `get_activity` / `get_summary` | Activity history |
| `get_pending_checkups` | Due reminders and tasks |

## Frontend

React 18 + TypeScript + Vite + Tailwind CSS + React Query + Recharts.

| Page | Purpose |
|------|---------|
| `Login.tsx` | Email/password + "Sign in with SSO" |
| `Register.tsx` | New account registration |
| `Dashboard.tsx` | Stat cards + 30-day activity chart |
| `Reminders.tsx` | Calendar grid with day-click to view/add |
| `Memories.tsx` | Searchable list with scope filter, tag filters, scope badge |
| `Teams.tsx` | Team list, create, detail view with member management |
| `Settings.tsx` | API key management (user/team keys) + theme toggle |
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
| `OPENAI_API_KEY` | No | - | OpenAI API key for semantic search + dedup (text-embedding-3-small) |
| `REDIS_URL` | No | - | Redis connection URL for vector storage (semantic search) |

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

### MCP Client Compatibility (Poke)
The `/mcp` endpoint uses `StreamableHTTPServerTransport` which requires clients to send `Accept: application/json, text/event-stream` headers. Poke and similar clients must be configured to use SSE (Server-Sent Events) format. The server attempts to inject these headers for clients that don't send them, but client-side SSE configuration is more reliable.

### Frontend External Access
The Vite dev server is configured for external access through reverse proxy:
- Listens on `0.0.0.0` (all interfaces)
- Port configurable via `PORT` environment variable
- API proxy target configurable via `VITE_API_PROXY_TARGET`
- Allows external domains via `allowedHosts` configuration

### Scope Route Order in memories.ts
`GET /api/memories/scopes` MUST be registered BEFORE `/:id` routes, otherwise Express matches "scopes" as an `:id` parameter.

## Testing Checklist

Before deploying changes:
1. `npx tsc --noEmit` — backend compiles
2. `cd frontend && npx tsc --noEmit` — frontend compiles
3. `docker compose build` — Docker image builds
4. Migrations run cleanly on fresh database
5. Verify MCP endpoint with API key auth
6. Verify web frontend login flow
7. Test backup/restore round-trip
8. MCP remember/recall without scope params works identically to before
9. Create team via API, add member, create team memory
10. Recall with user key returns personal + team + global memories
11. Forget team memory: author succeeds, non-author non-admin denied
