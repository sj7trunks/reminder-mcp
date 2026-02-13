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
  remember,
  recall,
  forget,
} from './tools/memory.js';

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

import { getPendingCheckups } from './services/scheduler.js';
import { getServerStatus } from './resources/status.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'reminder-mcp',
    version: '1.0.0',
  });

  // ============ REMINDER TOOLS ============

  server.tool(
    'create_reminder',
    'Schedule a reminder for a specific time',
    CreateReminderSchema.shape,
    async (args) => {
      const input = CreateReminderSchema.parse(args);
      const result = await createReminder(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'list_reminders',
    'Get pending or all reminders for a user',
    ListRemindersSchema.shape,
    async (args) => {
      const input = ListRemindersSchema.parse(args);
      const result = await listReminders(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'complete_reminder',
    'Mark a reminder as completed',
    ReminderIdSchema.shape,
    async (args) => {
      const input = ReminderIdSchema.parse(args);
      const result = await completeReminder(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'cancel_reminder',
    'Cancel a pending reminder',
    ReminderIdSchema.shape,
    async (args) => {
      const input = ReminderIdSchema.parse(args);
      const result = await cancelReminder(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ============ MEMORY TOOLS ============

  server.tool(
    'remember',
    'Store something to recall later (passive memory)',
    RememberSchema.shape,
    async (args) => {
      const input = RememberSchema.parse(args);
      const result = await remember(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'recall',
    'Get all stored memories with optional filter',
    RecallSchema.shape,
    async (args) => {
      const input = RecallSchema.parse(args);
      const result = await recall(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'forget',
    'Remove a memory item',
    ForgetSchema.shape,
    async (args) => {
      const input = ForgetSchema.parse(args);
      const result = await forget(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ============ TASK TOOLS ============

  server.tool(
    'start_task',
    'Begin tracking a long-running task with periodic check-ins',
    StartTaskSchema.shape,
    async (args) => {
      const input = StartTaskSchema.parse(args);
      const result = await startTask(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'check_task',
    'Get status and details of a specific task',
    TaskIdSchema.shape,
    async (args) => {
      const input = TaskIdSchema.parse(args);
      const result = await checkTask(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'list_tasks',
    'List all tasks for a user with optional status filter',
    ListTasksSchema.shape,
    async (args) => {
      const input = ListTasksSchema.parse(args);
      const result = await listTasks(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'complete_task',
    'Mark a task as completed',
    TaskIdSchema.shape,
    async (args) => {
      const input = TaskIdSchema.parse(args);
      const result = await completeTask(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'update_task',
    'Update task status or add notes',
    UpdateTaskSchema.shape,
    async (args) => {
      const input = UpdateTaskSchema.parse(args);
      const result = await updateTask(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ============ CHECKUP TOOLS ============

  server.tool(
    'get_pending_checkups',
    'Get all due reminders and tasks needing check-in (call this periodically)',
    {
      user_id: z.string().optional().describe('Optional user filter'),
    },
    async (args) => {
      const checkups = await getPendingCheckups(args.user_id);
      return {
        content: [{ type: 'text', text: JSON.stringify({ checkups }, null, 2) }],
      };
    }
  );

  // ============ HISTORY TOOLS ============

  server.tool(
    'get_activity',
    'Query activity history by time range, type, etc.',
    GetActivitySchema.shape,
    async (args) => {
      const input = GetActivitySchema.parse(args);
      const result = await getActivity(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'get_summary',
    'Get summary of recent activity for a user',
    GetSummarySchema.shape,
    async (args) => {
      const input = GetSummarySchema.parse(args);
      const result = await getSummary(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
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
