import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Import tools
import {
  CreateReminderSchema,
  ListRemindersSchema,
  ReminderIdSchema,
  createReminder,
  listReminders,
  completeReminder,
  cancelReminder,
} from './tools/reminders.js';

import {
  RememberSchema,
  RecallSchema,
  ForgetSchema,
  PromoteMemorySchema,
  ListScopesSchema,
  remember,
  recall,
  forget,
  promoteMemory,
  listScopes,
} from './tools/memory.js';

import type { McpContext } from './types/context.js';

import {
  StartTaskSchema,
  TaskIdSchema,
  ListTasksSchema,
  UpdateTaskSchema,
  startTask,
  checkTask,
  listTasks,
  completeTask,
  updateTask,
} from './tools/tasks.js';

import {
  GetActivitySchema,
  GetSummarySchema,
  getActivity,
  getSummary,
} from './tools/history.js';

import {
  RegisterWebhookSchema,
  UnregisterWebhookSchema,
  registerWebhookHandler,
  unregisterWebhookHandler,
  listWebhooksHandler,
} from './tools/webhooks.js';

import { getPendingCheckups } from './services/scheduler.js';
import { getServerStatus } from './resources/status.js';

// Strip user_id from response objects — the API key already identifies the user
function stripUserId(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripUserId);
  if (obj instanceof Date) return obj;
  if (obj && typeof obj === 'object') {
    const { user_id, ...rest } = obj as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(rest).map(([k, v]) => [k, stripUserId(v)])
    );
  }
  return obj;
}

function toResponse(result: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(stripUserId(result), null, 2) }] };
}

export function createServer(userId: string, context?: McpContext): McpServer {
  const server = new McpServer({
    name: 'reminder-mcp',
    version: '1.0.0',
  });

  // ============ REMINDER TOOLS ============

  server.tool(
    'create_reminder',
    'Schedule a reminder for a specific time',
    {
      title: CreateReminderSchema.shape.title,
      description: CreateReminderSchema.shape.description,
      due_at: CreateReminderSchema.shape.due_at,
      timezone: CreateReminderSchema.shape.timezone,
    },
    async (args) => {
      const input = CreateReminderSchema.parse({ ...args, user_id: userId });
      const result = await createReminder(input);
      return toResponse(result);
    }
  );

  server.tool(
    'list_reminders',
    'Get pending or all reminders for a user',
    {
      status: ListRemindersSchema.shape.status,
      limit: ListRemindersSchema.shape.limit,
    },
    async (args) => {
      const input = ListRemindersSchema.parse({ ...args, user_id: userId });
      const result = await listReminders(input);
      return toResponse(result);
    }
  );

  server.tool(
    'complete_reminder',
    'Mark a reminder as completed',
    ReminderIdSchema.shape,
    async (args) => {
      const input = ReminderIdSchema.parse(args);
      const result = await completeReminder({ ...input, user_id: userId });
      return toResponse(result);
    }
  );

  server.tool(
    'cancel_reminder',
    'Cancel a pending reminder',
    ReminderIdSchema.shape,
    async (args) => {
      const input = ReminderIdSchema.parse(args);
      const result = await cancelReminder({ ...input, user_id: userId });
      return toResponse(result);
    }
  );

  // ============ MEMORY TOOLS ============

  server.tool(
    'remember',
    'Store something to recall later (passive memory). Supports scoped memories: personal, team, application, or global.',
    {
      content: RememberSchema.shape.content,
      tags: RememberSchema.shape.tags,
      scope: RememberSchema.shape.scope,
      scope_id: RememberSchema.shape.scope_id,
      classification: RememberSchema.shape.classification,
      chat_id: RememberSchema.shape.chat_id,
    },
    async (args) => {
      const input = RememberSchema.parse({ ...args, user_id: userId });
      const result = await remember(input, context);
      return toResponse(result);
    }
  );

  server.tool(
    'recall',
    'Get all stored memories with optional filter. Without scope filter, returns personal + team + global memories.',
    {
      query: RecallSchema.shape.query,
      tags: RecallSchema.shape.tags,
      limit: RecallSchema.shape.limit,
      scope: RecallSchema.shape.scope,
      scope_id: RecallSchema.shape.scope_id,
      chat_id: RecallSchema.shape.chat_id,
    },
    async (args) => {
      const input = RecallSchema.parse({ ...args, user_id: userId });
      const result = await recall(input, context);
      return toResponse(result);
    }
  );

  server.tool(
    'forget',
    'Remove a memory item',
    ForgetSchema.shape,
    async (args) => {
      const input = ForgetSchema.parse(args);
      const result = await forget({ ...input, user_id: userId }, context);
      return toResponse(result);
    }
  );

  server.tool(
    'promote_memory',
    'Copy a memory to a different scope (e.g., personal to team or global)',
    {
      memory_id: PromoteMemorySchema.shape.memory_id,
      target_scope: PromoteMemorySchema.shape.target_scope,
      target_scope_id: PromoteMemorySchema.shape.target_scope_id,
    },
    async (args) => {
      const input = PromoteMemorySchema.parse({ ...args, user_id: userId });
      const result = await promoteMemory(input);
      return toResponse(result);
    }
  );

  server.tool(
    'list_scopes',
    'List all memory scopes available to this user (personal, teams, applications, global)',
    {},
    async () => {
      const result = await listScopes({ user_id: userId });
      return toResponse(result);
    }
  );

  // ============ TASK TOOLS ============

  server.tool(
    'start_task',
    'Begin tracking a long-running task with periodic check-ins',
    {
      title: StartTaskSchema.shape.title,
      command: StartTaskSchema.shape.command,
      check_interval_ms: StartTaskSchema.shape.check_interval_ms,
    },
    async (args) => {
      const input = StartTaskSchema.parse({ ...args, user_id: userId });
      const result = await startTask(input);
      return toResponse(result);
    }
  );

  server.tool(
    'check_task',
    'Get status and details of a specific task',
    TaskIdSchema.shape,
    async (args) => {
      const input = TaskIdSchema.parse(args);
      const result = await checkTask({ ...input, user_id: userId });
      return toResponse(result);
    }
  );

  server.tool(
    'list_tasks',
    'List all tasks for a user with optional status filter',
    {
      status: ListTasksSchema.shape.status,
      limit: ListTasksSchema.shape.limit,
    },
    async (args) => {
      const input = ListTasksSchema.parse({ ...args, user_id: userId });
      const result = await listTasks(input);
      return toResponse(result);
    }
  );

  server.tool(
    'complete_task',
    'Mark a task as completed',
    TaskIdSchema.shape,
    async (args) => {
      const input = TaskIdSchema.parse(args);
      const result = await completeTask({ ...input, user_id: userId });
      return toResponse(result);
    }
  );

  server.tool(
    'update_task',
    'Update task status or add notes',
    UpdateTaskSchema.shape,
    async (args) => {
      const input = UpdateTaskSchema.parse(args);
      const result = await updateTask({ ...input, user_id: userId });
      return toResponse(result);
    }
  );

  // ============ CHECKUP TOOLS ============

  server.tool(
    'get_pending_checkups',
    'Get all due reminders and tasks needing check-in (call this periodically)',
    {},
    async () => {
      const checkups = await getPendingCheckups();
      return toResponse({ checkups });
    }
  );

  // ============ WEBHOOK TOOLS ============

  server.tool(
    'register_webhook',
    'Register a URL to receive push notifications for reminders and tasks. Re-registering the same URL updates settings and resets failure count.',
    {
      url: RegisterWebhookSchema.shape.url,
      api_key: RegisterWebhookSchema.shape.api_key,
      events: RegisterWebhookSchema.shape.events,
    },
    async (args) => {
      const input = RegisterWebhookSchema.parse({ ...args, user_id: userId });
      const result = await registerWebhookHandler(input);
      return toResponse(result);
    }
  );

  server.tool(
    'unregister_webhook',
    'Remove a previously registered webhook URL',
    {
      url: UnregisterWebhookSchema.shape.url,
    },
    async (args) => {
      const input = UnregisterWebhookSchema.parse({ ...args, user_id: userId });
      const result = await unregisterWebhookHandler(input);
      return toResponse(result);
    }
  );

  server.tool(
    'list_webhooks',
    'List all registered webhook URLs for this user',
    {},
    async () => {
      const result = await listWebhooksHandler({ user_id: userId });
      return toResponse(result);
    }
  );

  // ============ HISTORY TOOLS ============

  server.tool(
    'get_activity',
    'Query activity history by time range, type, etc.',
    {
      type: GetActivitySchema.shape.type,
      action: GetActivitySchema.shape.action,
      since: GetActivitySchema.shape.since,
      until: GetActivitySchema.shape.until,
      limit: GetActivitySchema.shape.limit,
    },
    async (args) => {
      const input = GetActivitySchema.parse({ ...args, user_id: userId });
      const result = await getActivity(input);
      return toResponse(result);
    }
  );

  server.tool(
    'get_summary',
    'Get summary of recent activity for a user',
    {
      period: GetSummarySchema.shape.period,
    },
    async (args) => {
      const input = GetSummarySchema.parse({ ...args, user_id: userId });
      const result = await getSummary(input);
      return toResponse(result);
    }
  );

  // ============ RESOURCES ============

  server.resource(
    'status',
    'reminder://status',
    async () => {
      const status = await getServerStatus();
      return {
        contents: [
          {
            uri: 'reminder://status',
            mimeType: 'application/json',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );

  return server;
}
