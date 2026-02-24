import type { Notification } from './notifier.js';

const VALID_EVENT_TYPES = ['reminder', 'task_checkin', 'task_complete'] as const;
export type WebhookEventType = typeof VALID_EVENT_TYPES[number];

export interface RegisteredWebhook {
  userId: string;
  url: string;
  apiKey?: string;
  events: WebhookEventType[];  // empty = all events
  consecutiveFailures: number;
  registeredAt: Date;
}

const MAX_CONSECUTIVE_FAILURES = 3;
const DELIVERY_TIMEOUT_MS = 10_000;

// In-memory registry keyed by `${userId}\0${url}`
const registry = new Map<string, RegisteredWebhook>();

function compositeKey(userId: string, url: string): string {
  return `${userId}\0${url}`;
}

export function isValidEventType(type: string): type is WebhookEventType {
  return (VALID_EVENT_TYPES as readonly string[]).includes(type);
}

export function registerWebhook(
  userId: string,
  url: string,
  apiKey?: string,
  events?: string[],
): { success: true; webhook: Omit<RegisteredWebhook, 'apiKey'> } | { success: false; error: string } {
  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { success: false, error: `Invalid URL: ${url}` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { success: false, error: 'URL must use http or https protocol' };
  }

  // Validate event types
  const validatedEvents: WebhookEventType[] = [];
  if (events && events.length > 0) {
    for (const e of events) {
      if (!isValidEventType(e)) {
        return { success: false, error: `Invalid event type: ${e}. Valid types: ${VALID_EVENT_TYPES.join(', ')}` };
      }
      validatedEvents.push(e);
    }
  }

  const webhook: RegisteredWebhook = {
    userId,
    url: parsed.toString(),
    apiKey,
    events: validatedEvents,
    consecutiveFailures: 0,
    registeredAt: new Date(),
  };

  registry.set(compositeKey(userId, parsed.toString()), webhook);

  const { apiKey: _stripped, ...safe } = webhook;
  return { success: true, webhook: safe };
}

export function unregisterWebhook(
  userId: string,
  url: string,
): { success: boolean; error?: string } {
  // Normalize URL for lookup
  let normalized: string;
  try {
    normalized = new URL(url).toString();
  } catch {
    normalized = url;
  }

  const key = compositeKey(userId, normalized);
  const webhook = registry.get(key);

  if (!webhook) {
    return { success: false, error: 'Webhook not found' };
  }
  if (webhook.userId !== userId) {
    return { success: false, error: 'Not authorized to remove this webhook' };
  }

  registry.delete(key);
  return { success: true };
}

export function listWebhooks(userId: string): Omit<RegisteredWebhook, 'apiKey'>[] {
  const results: Omit<RegisteredWebhook, 'apiKey'>[] = [];
  for (const webhook of registry.values()) {
    if (webhook.userId === userId) {
      const { apiKey: _stripped, ...safe } = webhook;
      results.push(safe);
    }
  }
  return results;
}

export async function deliverToRegisteredWebhooks(notification: Notification): Promise<void> {
  const matching: RegisteredWebhook[] = [];
  for (const webhook of registry.values()) {
    if (webhook.userId !== notification.user_id) continue;
    // Empty events array = subscribe to all events
    if (webhook.events.length > 0 && !webhook.events.includes(notification.type)) continue;
    matching.push(webhook);
  }

  if (matching.length === 0) return;

  const payload = JSON.stringify({
    type: notification.type,
    user_id: notification.user_id,
    title: notification.title,
    message: notification.message,
    entity_id: notification.entity_id,
    metadata: notification.metadata,
    timestamp: new Date().toISOString(),
  });

  const results = await Promise.allSettled(
    matching.map(async (webhook) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (webhook.apiKey) {
          headers['Authorization'] = `Bearer ${webhook.apiKey}`;
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: payload,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // Success — reset failure count
        webhook.consecutiveFailures = 0;
      } catch (error) {
        webhook.consecutiveFailures++;
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[webhook-registry] Delivery failed for ${webhook.url} (${webhook.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${reason}`);

        if (webhook.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          const key = compositeKey(webhook.userId, webhook.url);
          registry.delete(key);
          console.warn(`[webhook-registry] Auto-unregistered ${webhook.url} after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        }
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  // Log summary
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[webhook-registry] ${failed}/${results.length} deliveries had unhandled rejections`);
  }
}

export function clearRegistry(): void {
  registry.clear();
}
