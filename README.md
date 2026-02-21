# Reminder MCP Server

An MCP (Model Context Protocol) server that gives AI assistants reliable reminders, persistent memory, task tracking, and activity history. Built for [Poke](https://poke.com) (an iMessage AI bot) and compatible with any MCP client.

## Description

Poke is a great AI assistant, but its built-in reminders, tasks, and memory features had reliability issues. Rather than wait for fixes, I built this MCP server with the help of [Claude Code](https://claude.ai/claude-code) to handle those capabilities myself. The result is a self-hosted stack that makes Poke (and any MCP-compatible client) significantly more useful.

The server exposes 17 MCP tools over Streamable HTTP, backed by a multi-user web dashboard for managing everything through a browser. It supports SQLite for simple setups and PostgreSQL for production, with optional Authentik SSO integration.

## Features

- **Scheduled Reminders** — Time-based notifications with natural language parsing ("tomorrow at 2pm", "in 30 minutes"). Webhook push notifications when reminders trigger.
- **Persistent Memory** — Store and recall information on demand. Tag-based organization with full-text search and optional semantic search (OpenAI embeddings + Redis). Supports scoped memories (personal, team, application, global) with dedup-on-write.
- **Task Tracking** — Long-running tasks with configurable check-in intervals (default 5 min). Periodic webhook notifications until completion.
- **Activity History** — Full audit log of all events. Query by time range, type, and action with day/week/month summaries.
- **Web Dashboard** — React frontend with stat cards, 30-day activity charts (Recharts), calendar view for reminders, and searchable memory list.
- **Teams & Applications** — Create teams, add members, and share memories across team members. Applications can be scoped to teams for per-agent knowledge.
- **Multi-User** — Per-user data isolation with scoped sharing. MCP clients authenticate via API keys (user or team-scoped), the web frontend uses JWT cookies. First user is auto-promoted to admin.
- **SSO Integration** — Optional Authentik forward auth via Traefik. Users are auto-created on first SSO login.
- **API Key Management** — Create and revoke API keys from the web UI. Keys are SHA-256 hashed (never stored in plaintext).
- **Admin Panel** — User management with admin role toggle. Full database backup (`.json.gz` download) and restore.
- **Dark Mode** — System preference detection with manual light/dark/system toggle.
- **Dual Database Support** — SQLite for development and simple deployments, PostgreSQL for production.
- **Webhook Notifications** — Push notifications to Poke (or any endpoint) when reminders trigger or tasks need check-ins.

## Why This Project Is Useful

- **Poke's built-in features are unreliable** — Reminders don't always fire, memory is inconsistent, and task tracking is limited. This server replaces all of that with a robust, self-hosted alternative.
- **Works with any MCP client** — Not locked into Poke. Works with Claude Desktop, any MCP-compatible tool, or the included web dashboard.
- **You own your data** — Self-hosted with full backup/restore. No vendor lock-in, no third-party data storage.
- **Multi-user ready** — Supports multiple users with data isolation, SSO, and admin controls. Run it for yourself or share it with others.
- **Production-grade** — PostgreSQL, Docker, health checks, Traefik integration, and Authentik SSO. Not a toy — this runs in production.

## MCP Tools (17)

| Tool | Description |
|------|-------------|
| `create_reminder` | Schedule a reminder (supports natural language times) |
| `list_reminders` | List pending or all reminders |
| `complete_reminder` | Mark a reminder as completed |
| `cancel_reminder` | Cancel a pending reminder |
| `remember` | Store a memory with optional scope, classification, and tags |
| `recall` | Retrieve memories across scopes with search/tag/scope filter |
| `forget` | Remove a memory (scope-based permission check) |
| `promote_memory` | Copy a memory to a different scope (e.g., personal to team) |
| `list_scopes` | List available memory scopes (personal, teams, apps, global) |
| `start_task` | Begin tracking a long-running task |
| `check_task` | Get status of a specific task |
| `list_tasks` | List tasks with optional status filter |
| `complete_task` | Mark a task as completed |
| `update_task` | Update task status or add notes |
| `get_pending_checkups` | Get all due reminders and tasks needing check-in |
| `get_activity` | Query activity history by time range |
| `get_summary` | Get summary of recent activity |

## Getting Started

### Option 1: Standalone with SQLite

The simplest setup — no external database required.

```bash
# Clone and build
git clone https://github.com/sj7trunks/reminder-mcp.git
cd reminder-mcp
npm install
npm run build

# Generate secrets
export API_KEY=$(openssl rand -hex 32)
export SECRET_KEY=$(openssl rand -hex 32)

# Run in HTTP mode
API_KEY=$API_KEY SECRET_KEY=$SECRET_KEY npm run start:http

# Verify
curl http://localhost:3000/health
```

The SQLite database is created automatically at `./data/reminder.db`.

For local use with Claude Desktop (stdio mode), add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "reminder": {
      "command": "node",
      "args": ["/path/to/reminder-mcp/dist/index.js"],
      "env": {
        "DATABASE_PATH": "/path/to/reminder-mcp/data/reminder.db",
        "DEFAULT_TIMEZONE": "America/Los_Angeles"
      }
    }
  }
}
```

### Option 2: Production with PostgreSQL & Docker

```bash
# Generate secrets
export API_KEY=$(openssl rand -hex 32)
export SECRET_KEY=$(openssl rand -hex 32)
export PG_PASSWORD=$(openssl rand -hex 16)

echo "Save these values:"
echo "  API_KEY=$API_KEY"
echo "  SECRET_KEY=$SECRET_KEY"
echo "  PG_PASSWORD=$PG_PASSWORD"
```

Add to your `docker-compose.yml`:

```yaml
services:
  reminder-mcp-postgres:
    image: postgres:16-alpine
    container_name: reminder-mcp-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=reminder
      - POSTGRES_PASSWORD=${PG_PASSWORD}
      - POSTGRES_DB=reminder_mcp
    volumes:
      - reminder-mcp-pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U reminder -d reminder_mcp"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  reminder-mcp:
    build:
      context: ./reminder-mcp
      dockerfile: Dockerfile
    container_name: reminder-mcp
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0
      - API_KEY=${API_KEY}
      - SECRET_KEY=${SECRET_KEY}
      - DATABASE_TYPE=postgres
      - DATABASE_URL=postgresql://reminder:${PG_PASSWORD}@reminder-mcp-postgres:5432/reminder_mcp
      - DEFAULT_TIMEZONE=America/Los_Angeles
      # Optional: Push notifications
      # - WEBHOOK_URL=https://poke.com/api/v1/inbound-sms/webhook
      # - WEBHOOK_API_KEY=your-poke-api-key
      # Optional: Authentik SSO
      # - AUTHENTIK_HOST=https://your-authentik-domain.com
    depends_on:
      reminder-mcp-postgres:
        condition: service_healthy
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s

volumes:
  reminder-mcp-pg-data:
    driver: local
```

```bash
docker compose up -d
curl http://localhost:3000/health
```

### Configuring Poke

1. Open Poke > Settings > Integrations > New Integration
2. Fill in:
   - **Name**: `Reminders`
   - **Server URL**: `https://your-domain.com/mcp`
   - **API Key**: Your generated API key
3. Create the integration

For push notifications (so Poke messages you when reminders trigger):
1. Go to Poke > Settings > Advanced and generate a webhook API key
2. Set `WEBHOOK_URL` and `WEBHOOK_API_KEY` in your environment

**Important**: Poke requires SSE (Server-Sent Events) format. Configure your MCP client to accept `text/event-stream` in addition to `application/json`.

### Optional: Semantic Search

Enable AI-powered semantic search for memories using OpenAI embeddings and Redis:

```bash
# Set environment variables
export OPENAI_API_KEY=sk-...
export REDIS_URL=redis://localhost:6379

# Or add to docker-compose.yml
environment:
  - OPENAI_API_KEY=${OPENAI_API_KEY}
  - REDIS_URL=redis://redis:6379
```

Semantic search uses `text-embedding-3-small` (1536 dimensions) stored in Redis with vector similarity search. Embeddings are generated automatically in the background when memories are created or updated.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | Yes (HTTP) | - | Seed API key (hashed on first run) |
| `SECRET_KEY` | Yes | - | JWT signing secret |
| `PORT` | No | `3000` | HTTP server port |
| `HOST` | No | `0.0.0.0` | HTTP server bind address |
| `DATABASE_TYPE` | No | `sqlite` | `sqlite` or `postgres` |
| `DATABASE_PATH` | No | `./data/reminder.db` | SQLite file path |
| `DATABASE_URL` | No | - | PostgreSQL connection string |
| `DEFAULT_TIMEZONE` | No | `America/Los_Angeles` | Default timezone |
| `WEBHOOK_URL` | No | - | Push notification endpoint |
| `WEBHOOK_API_KEY` | No | - | Bearer token for webhook |
| `AUTHENTIK_HOST` | No | - | Authentik base URL for SSO |
| `OPENAI_API_KEY` | No | - | OpenAI API key for semantic search |
| `REDIS_URL` | No | - | Redis URL for vector storage (semantic search) |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |

## Project Structure

```
reminder-mcp/
├── src/
│   ├── index.ts              # stdio transport entry point
│   ├── http.ts               # HTTP transport entry point (Express app)
│   ├── server.ts             # MCP server & tool registration
│   ├── config/
│   │   └── index.ts          # Zod-validated environment config
│   ├── types/
│   │   └── context.ts        # McpContext interface for scope/auth
│   ├── db/
│   │   ├── index.ts          # Knex connection (SQLite/PostgreSQL)
│   │   ├── migrations/       # Database migrations (001-010)
│   │   └── models/           # Zod schemas (User, ApiKey, Team, Memory, etc.)
│   ├── middleware/
│   │   └── auth.ts           # JWT, API key, Authentik SSO middleware
│   ├── routes/
│   │   ├── auth.ts           # Register, login, logout, session
│   │   ├── keys.ts           # API key management
│   │   ├── reminders.ts      # Reminder CRUD
│   │   ├── memories.ts       # Memory CRUD with search + scope filtering
│   │   ├── tasks.ts          # Task CRUD
│   │   ├── stats.ts          # Dashboard statistics
│   │   ├── admin.ts          # User management, backup/restore
│   │   ├── teams.ts          # Team CRUD + member management
│   │   └── applications.ts   # Application CRUD
│   ├── services/
│   │   ├── scheduler.ts      # Background job scheduler (60s poll)
│   │   ├── notifier.ts       # Webhook notifications (Poke format)
│   │   ├── timezone.ts       # Timezone conversion & parsing
│   │   ├── embedding.ts      # OpenAI embeddings (text-embedding-3-small)
│   │   └── embedding-worker.ts  # Background worker for generating embeddings
│   ├── tools/
│   │   ├── reminders.ts      # Reminder MCP tools
│   │   ├── memory.ts         # Memory MCP tools
│   │   ├── tasks.ts          # Task MCP tools
│   │   └── history.ts        # Activity query tools
│   └── resources/
│       └── status.ts         # Server status resource
├── frontend/
│   ├── src/
│   │   ├── main.tsx          # React entry point
│   │   ├── App.tsx           # Router with auth guards
│   │   ├── api/client.ts     # API client (fetch + credentials)
│   │   ├── components/
│   │   │   └── Layout.tsx    # App shell with nav & theme toggle
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx  # Dark/light/system theme
│   │   └── pages/
│   │       ├── Login.tsx     # Login form + SSO button
│   │       ├── Register.tsx  # Registration form
│   │       ├── Dashboard.tsx # Stats + activity chart
│   │       ├── Reminders.tsx # Calendar view
│   │       ├── Memories.tsx  # Searchable memory list with scope filter
│   │       ├── Teams.tsx     # Team management + members
│   │       ├── Settings.tsx  # API keys (user/team) + theme
│   │       └── Admin.tsx     # User mgmt + backup/restore
│   ├── vite.config.ts        # Vite config with dev proxy
│   └── tailwind.config.js    # Tailwind CSS config
├── Dockerfile                # Multi-stage Docker build
├── docker-compose.yml        # Standalone Docker setup
├── .env.example              # Environment variable template
├── CLAUDE.md                 # Development guide for AI assistants
└── LICENSE                   # MIT License
```

## Tech Stack

- **Runtime**: Node.js 20 + TypeScript (ESM)
- **MCP**: `@modelcontextprotocol/sdk` (Streamable HTTP transport)
- **Backend**: Express 5, Knex.js, Zod
- **Frontend**: React 18, Vite, Tailwind CSS, React Query, Recharts
- **Database**: SQLite (better-sqlite3) or PostgreSQL
- **Auth**: JWT (jsonwebtoken), bcrypt, SHA-256 API key hashing
- **SSO**: Authentik forward auth via Traefik

## Getting Help

If you encounter issues or have questions:

- [Open an Issue](https://github.com/sj7trunks/reminder-mcp/issues) — Bug reports and feature requests
- [Discussions](https://github.com/sj7trunks/reminder-mcp/discussions) — Questions and general discussion

## Credits

Built by [Benjamin Coles](https://github.com/sj7trunks) with [Claude Code](https://claude.ai/claude-code).

## License

MIT — see [LICENSE](LICENSE).

## Security Notice

This project was built as a personal tool and has not undergone a formal security audit. If you deploy this in production:

- Generate strong, unique values for `API_KEY` and `SECRET_KEY` (`openssl rand -hex 32`)
- Use HTTPS (TLS) for all traffic — never expose the API over plain HTTP
- Review the authentication middleware (`src/middleware/auth.ts`) for your threat model
- Keep dependencies updated (`npm audit`)
- Consider network-level access controls (firewall rules, VPN) in addition to application-level auth
- The admin backup/restore endpoints can export and overwrite all data — restrict admin access carefully
