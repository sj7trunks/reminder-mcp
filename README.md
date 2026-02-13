# Reminder MCP Server

An MCP (Model Context Protocol) server that provides persistent memory, scheduled reminders, task tracking, and activity history for Poke (iMessage bot) and other AI assistants.

## Features

### Scheduled Reminders
Time-based notifications with full timezone support. Supports natural language like "tomorrow at 2pm" or "in 30 minutes".

```
User: "Remind me to setup graphql tomorrow at 2pm"
→ Stored in DB, triggers at the right time
```

### Passive Memory
Store information for on-demand recall. Perfect for "remember this for later" use cases.

```
User: "Remember to run a security audit on datestack"
→ Stored and retrievable via "what do I need to remember?"
```

### Task Tracking
Long-running tasks with configurable check-in intervals. Get periodic pokes about ongoing work.

```
User: "Run deep research on best time to vacation in Hawaii"
→ Tracked with 5-minute check-ins until completed
```

### Activity History
Full audit log of all events. Query what happened over any time period.

```
User: "What have I done in the past week?"
→ Returns summary of reminders, tasks, and memories
```

## Installation

```bash
git clone <repo>
cd reminder-mcp
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server host |
| `API_KEY` | - | API key for authentication (required for production) |
| `DATABASE_TYPE` | `sqlite` | Database type: `sqlite` or `postgres` |
| `DATABASE_PATH` | `./data/reminder.db` | Path to SQLite database |
| `DATABASE_URL` | - | PostgreSQL connection string (for production) |
| `REDIS_URL` | - | Redis URL for Bull queue (optional) |
| `WEBHOOK_URL` | - | Webhook URL for push notifications (optional) |
| `DEFAULT_TIMEZONE` | `America/Los_Angeles` | Default timezone for reminders |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `warn`, `error` |

## Usage

### Running Modes

This server supports two transport modes:

| Mode | Command | Use Case |
|------|---------|----------|
| **stdio** | `npm run start` | Local tools (Claude Desktop) |
| **HTTP/SSE** | `npm run start:http` | Remote clients (Poke, web apps) |

### Local Development

```bash
# stdio mode (for Claude Desktop)
npm run dev

# HTTP mode (for Poke)
API_KEY=your-secret-key npm run dev:http
```

### Production with Docker

The easiest way to deploy is with Docker:

```bash
# 1. Generate an API key
export API_KEY=$(openssl rand -hex 32)
echo "Your API key: $API_KEY"

# 2. Start the server
docker-compose up -d

# 3. Check it's running
curl http://localhost:3000/health
```

The server will be available at `http://localhost:3000/sse`.

#### Docker Compose Configuration

Create a `.env` file for docker-compose:

```bash
API_KEY=your-generated-api-key
DEFAULT_TIMEZONE=America/Los_Angeles
LOG_LEVEL=info
```

Then run:

```bash
docker-compose up -d
```

#### Exposing to the Internet

For Poke to access your server, you need a public URL. Options:

1. **Reverse Proxy (Recommended)**: Use nginx/Caddy with SSL
2. **Cloud Deploy**: Deploy to Railway, Fly.io, or similar
3. **Tunneling**: Use ngrok or Cloudflare Tunnel for testing

Example nginx config:

```nginx
server {
    listen 443 ssl;
    server_name mcp.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # SSE specific settings
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

### Configuring Poke

Once your server is running and accessible:

1. Open Poke app → Settings → Integrations → New Integration
2. Fill in:
   - **Name**: `Reminders` (or whatever you prefer)
   - **Server URL**: `https://mcp.yourdomain.com/sse`
   - **API Key**: Your generated API key
3. Tap "Create Integration"

Poke will automatically discover the available tools and you can start using commands like:

- "Remind me to call mom tomorrow at 5pm"
- "Remember that the wifi password is hunter2"
- "What do I need to remember?"
- "Start tracking my workout routine"

### With Claude Desktop (Local)

For local use with Claude Desktop, use stdio mode. Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "reminder": {
      "command": "node",
      "args": ["/absolute/path/to/reminder-mcp/dist/index.js"],
      "env": {
        "DATABASE_PATH": "/absolute/path/to/reminder-mcp/data/reminder.db",
        "DEFAULT_TIMEZONE": "America/Los_Angeles"
      }
    }
  }
}
```

### Testing with MCP Inspector

```bash
# Test stdio mode
npx @modelcontextprotocol/inspector node dist/index.js

# Test HTTP mode
API_KEY=test-key npm run start:http
# Then open http://localhost:3000/sse in the inspector
```

## MCP Tools Reference

### Reminder Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `create_reminder` | Schedule a reminder | `user_id`, `title`, `due_at`, `description?`, `timezone?` |
| `list_reminders` | Get reminders | `user_id`, `status?` (pending/triggered/completed/cancelled/all), `limit?` |
| `complete_reminder` | Mark as done | `reminder_id` |
| `cancel_reminder` | Cancel pending | `reminder_id` |

### Memory Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `remember` | Store a memory | `user_id`, `content`, `tags?` |
| `recall` | Retrieve memories | `user_id`, `query?`, `tags?`, `limit?` |
| `forget` | Delete a memory | `memory_id` |

### Task Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `start_task` | Begin tracking | `user_id`, `title`, `command?`, `check_interval_ms?` |
| `check_task` | Get task status | `task_id` |
| `list_tasks` | List all tasks | `user_id`, `status?`, `limit?` |
| `complete_task` | Mark complete | `task_id` |
| `update_task` | Update status | `task_id`, `status?`, `notes?` |

### Polling & History

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_pending_checkups` | Get due items | `user_id?` |
| `get_activity` | Query history | `user_id`, `type?`, `action?`, `since?`, `until?`, `limit?` |
| `get_summary` | Activity summary | `user_id`, `period?` (day/week/month) |

## Notification Strategy

Since MCP doesn't support reliable push notifications, this server uses a **polling approach**:

1. **Primary**: Client calls `get_pending_checkups` periodically
2. **Optional**: Configure `WEBHOOK_URL` for push notifications to your service
3. **Future**: Slack/Discord integrations

## Database Schema

### reminders
- `id` (UUID), `user_id`, `title`, `description`, `due_at`, `timezone`, `status`, `created_at`

### memories
- `id` (UUID), `user_id`, `content`, `tags` (JSON), `recalled_count`, `created_at`

### tasks
- `id` (UUID), `user_id`, `title`, `command`, `status`, `check_interval_ms`, `last_check_at`, `next_check_at`, `created_at`, `completed_at`

### activities
- `id` (UUID), `user_id`, `type`, `action`, `entity_id`, `metadata` (JSON), `created_at`

## Development

### Database Migrations

```bash
# Run migrations
npm run migrate

# Create new migration
npm run migrate:make -- create_new_table

# Rollback
npm run migrate:rollback
```

### Project Structure

```
src/
├── index.ts              # Entry point, stdio transport (for Claude Desktop)
├── http.ts               # Entry point, HTTP/SSE transport (for Poke)
├── server.ts             # MCP server, tool registration
├── config/
│   └── index.ts          # Environment configuration
├── db/
│   ├── index.ts          # Knex connection
│   ├── migrations/       # Database migrations
│   └── models/           # TypeScript types & Zod schemas
├── services/
│   ├── scheduler.ts      # Background job scheduler
│   ├── notifier.ts       # Webhook notifications
│   └── timezone.ts       # Timezone utilities
├── tools/
│   ├── reminders.ts      # Reminder CRUD
│   ├── memory.ts         # Memory CRUD
│   ├── tasks.ts          # Task tracking
│   └── history.ts        # Activity queries
└── resources/
    └── status.ts         # Server status resource
```

## Tech Stack

- **Runtime**: Node.js with TypeScript (ESM)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **HTTP Server**: Express.js with SSE transport
- **Database**: Knex.js with SQLite (dev) / PostgreSQL (prod)
- **Validation**: Zod
- **Timezone**: date-fns + date-fns-tz

## License

MIT
