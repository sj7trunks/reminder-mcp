import { config } from '../config/index.js';

export interface Notification {
  type: 'reminder' | 'task_checkin' | 'task_complete';
  user_id: string;
  title: string;
  message: string;
  entity_id: string;
  metadata?: Record<string, unknown>;
}

export async function sendNotification(notification: Notification): Promise<boolean> {
  // If webhook is configured, send notification
  if (config.webhook.url) {
    try {
      const response = await fetch(config.webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notification),
      });

      if (!response.ok) {
        console.error(`Webhook notification failed: ${response.status} ${response.statusText}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Webhook notification error:', error);
      return false;
    }
  }

  // No webhook configured - notification will be retrieved via polling
  console.log(`[Notification] ${notification.type}: ${notification.title}`);
  return true;
}
