import { z } from 'zod';
import {
  registerWebhook,
  unregisterWebhook,
  listWebhooks,
} from '../services/webhook-registry.js';

export const RegisterWebhookSchema = z.object({
  user_id: z.string(),
  url: z.string().url().describe('Webhook URL to receive POST notifications (http or https)'),
  api_key: z.string().optional().describe('Optional Bearer token sent with webhook deliveries'),
  events: z.array(z.enum(['reminder', 'task_checkin', 'task_complete'])).optional()
    .describe('Event types to subscribe to. Empty or omitted = all events.'),
});

export const UnregisterWebhookSchema = z.object({
  user_id: z.string(),
  url: z.string().url().describe('Webhook URL to unregister'),
});

export const ListWebhooksSchema = z.object({
  user_id: z.string(),
});

export async function registerWebhookHandler(
  input: z.infer<typeof RegisterWebhookSchema>,
): Promise<{ success: boolean; webhook?: Record<string, unknown>; error?: string }> {
  const result = registerWebhook(input.user_id, input.url, input.api_key, input.events);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true, webhook: result.webhook as unknown as Record<string, unknown> };
}

export async function unregisterWebhookHandler(
  input: z.infer<typeof UnregisterWebhookSchema>,
): Promise<{ success: boolean; error?: string }> {
  return unregisterWebhook(input.user_id, input.url);
}

export async function listWebhooksHandler(
  input: z.infer<typeof ListWebhooksSchema>,
): Promise<{ webhooks: Record<string, unknown>[] }> {
  const webhooks = listWebhooks(input.user_id);
  return { webhooks: webhooks as unknown as Record<string, unknown>[] };
}
