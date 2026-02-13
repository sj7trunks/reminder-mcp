# Reminder MCP Server

An MCP (Model Context Protocol) server that provides scheduled reminders, passive memory, task tracking, and activity history for AI assistants. Built for [Poke](https://poke.com) and any MCP-compatible client.

## Features

### Scheduled Reminders
Time-based notifications with full timezone support. Supports natural language like "tomorrow at 2pm" or "in 30 minutes". When a reminder triggers, a webhook notification is sent to your configured endpoint (e.g., Poke).

### Passive Memory
Store information for on-demand recall. Perfect for "remember this for later" use cases with optional tagging for organization.

### Task Tracking
Long-running tasks with configurable check-in intervals. The server sends periodic webhook notifications (default every 5 minutes) until the task is marked complete.

### Activity History
Full audit log of all events. Query what happened over any time period with summaries by day, week, or month.

### Webhook Notifications
Push notifications via webhook when reminders trigger or tasks need check-ins. Compatible with Poke's inbound webhook API.

## MCP Tools

- `create_reminder` - Schedule a reminder for a specific time (supports natural language like "tomorrow at 2pm")
- `list_reminders` - Get pending/all reminders for a user
- `complete_reminder` - Mark a reminder as completed
- `cancel_reminder` - Cancel a pending reminder
- `remember` - Store something to recall later (passive memory, with optional tags)
- `recall` - Retrieve stored memories with optional search/tag filter
- `forget` - Remove a memory item
- `start_task` - Begin tracking a long-running task with periodic check-ins (default 5 min)
- `check_task` - Get status of a specific task
- `list_tasks` - List all tasks with optional status filter
- `complete_task` - Mark a task as completed
- `update_task` - Update task status or add notes
- `get_pending_checkups` - Get all due reminders and tasks needing check-in
- `get_activity` - Query activity history by time range, type, action
- `get_summary` - Get summary of recent activity (day/week/month)

## Installation

```bash
git clone https://github.com/sj7trunks/reminder-mcp.git
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

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP server port |
| `HOST` | No | `0.0.0.0` | HTTP server host |
| `API_KEY` | Yes (HTTP) | - | API key for authentication |
| `DATABASE_TYPE` | No | `sqlite` | `sqlite` or `postgres` |
| `DATABASE_PATH` | No | `./data/reminder.db` | Path to SQLite database |
| `DATABASE_URL` | No | - | PostgreSQL connection string |
| `REDIS_URL` | No | - | Redis URL for Bull queue (optional) |
| `WEBHOOK_URL` | No | - | Webhook URL for push notifications |
| `WEBHOOK_API_KEY` | No | - | API key for webhook authentication (sent as Bearer token) |
| `DEFAULT_TIMEZONE` | No | `America/Los_Angeles` | Default timezone for reminders |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |

## Usage

### Running Modes

| Mode | Command | Use Case |
|------|---------|----------|
| **stdio** | `npm run start` | Local tools (Claude Desktop) |
| **HTTP** | `npm run start:http` | Remote clients (Poke, web apps) |

### Local Development

```bash
# stdio mode (for Claude Desktop)
npm run dev

# HTTP mode (for Poke)
API_KEY=your-secret-key npm run dev:http
```

### Production with Docker

```bash
# 1. Generate an API key
export API_KEY=$(openssl rand -hex 32)
echo "Your API key: $API_KEY"

# 2. Start the server
docker compose up -d

# 3. Check it's running
curl http://localhost:3000/health
```

### Docker Compose Configuration

Create a `.env` file for docker compose:

```bash
API_KEY=your-generated-api-key
DEFAULT_TIMEZONE=America/Los_Angeles
LOG_LEVEL=info
WEBHOOK_URL=https://poke.com/api/v1/inbound-sms/webhook
WEBHOOK_API_KEY=your-poke-api-key
```

Then run:

```bash
docker compose up -d
```

### Transport

This server uses the **Streamable HTTP** transport (MCP spec 2025-03-26). The MCP endpoint is at `/mcp` and accepts JSON-RPC requests via POST.

### Configuring Poke

1. Open Poke app > Settings > Integrations > New Integration
2. Fill in:
   - **Name**: `Reminders`
   - **Server URL**: `https://your-domain.com/mcp`
   - **API Key**: Your generated API key
3. Create the integration

To enable push notifications when reminders trigger:
1. Go to Poke > Settings > Advanced and generate a webhook API key
2. Set `WEBHOOK_URL=https://poke.com/api/v1/inbound-sms/webhook` and `WEBHOOK_API_KEY=your-poke-key` in your environment

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

## How Notifications Work

The server runs a background scheduler every 60 seconds that checks for:

1. **Due reminders** - Reminders whose `due_at` time has passed. When found, the reminder is marked as `triggered` and a webhook notification is sent.
2. **Task check-ins** - Tasks whose `next_check_at` time has passed. A webhook notification is sent and the next check-in is scheduled based on the task's `check_interval_ms` (default 5 minutes).

If `WEBHOOK_URL` is configured, notifications are sent as:

```
POST {WEBHOOK_URL}
Authorization: Bearer {WEBHOOK_API_KEY}
Content-Type: application/json

{"message": "Reminder title: Your reminder is due"}
```

If no webhook is configured, notifications are logged to the console.

## Database Schema

### reminders
`id` (UUID), `user_id`, `title`, `description`, `due_at` (UTC), `timezone`, `status` (pending/triggered/completed/cancelled), `created_at`

### memories
`id` (UUID), `user_id`, `content`, `tags` (JSON), `recalled_count`, `created_at`

### tasks
`id` (UUID), `user_id`, `title`, `command`, `status` (pending/in_progress/completed/failed), `check_interval_ms`, `last_check_at`, `next_check_at`, `created_at`, `completed_at`

### activities
`id` (UUID), `user_id`, `type` (reminder/memory/task/query), `action`, `entity_id`, `metadata` (JSON), `created_at`

## Development

### Database Migrations

```bash
npm run migrate              # Run migrations
npm run migrate:make -- name # Create new migration
npm run migrate:rollback     # Rollback
```

### Project Structure

```
src/
├── index.ts              # stdio transport (Claude Desktop)
├── http.ts               # Streamable HTTP transport (Poke)
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
- **MCP SDK**: `@modelcontextprotocol/sdk` (Streamable HTTP transport)
- **HTTP Server**: Express.js
- **Database**: Knex.js with SQLite (dev) / PostgreSQL (prod)
- **Validation**: Zod
- **Timezone**: date-fns + date-fns-tz

## License

MIT - see [LICENSE](LICENSE)
