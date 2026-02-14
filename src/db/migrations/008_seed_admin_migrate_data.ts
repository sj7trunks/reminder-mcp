import type { Knex } from 'knex';
import crypto from 'crypto';

export async function up(knex: Knex): Promise<void> {
  // Only seed admin + migrate data if there are existing records to migrate.
  // On a fresh database (e.g. new PostgreSQL instance) skip seeding so that
  // the first user who registers gets auto-promoted to admin instead.
  const existingReminders = await knex('reminders').select('id').limit(1);
  const existingMemories = await knex('memories').select('id').limit(1);
  const existingTasks = await knex('tasks').select('id').limit(1);
  const hasExistingData =
    existingReminders.length > 0 ||
    existingMemories.length > 0 ||
    existingTasks.length > 0;

  if (!hasExistingData) {
    return;
  }

  // Require ADMIN_EMAIL env var to migrate existing data to a real user.
  // If not set, create a placeholder that the first Authentik login will claim.
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@placeholder.local';

  // 1. Create admin user
  const adminId = crypto.randomUUID();
  const now = new Date().toISOString();

  await knex('users').insert({
    id: adminId,
    email: adminEmail,
    name: 'Admin',
    password_hash: null,
    is_admin: true,
    created_at: now,
    updated_at: now,
  });

  // 2. Migrate all existing data to admin user
  await knex('reminders').update({ user_id: adminId });
  await knex('memories').update({ user_id: adminId });
  await knex('tasks').update({ user_id: adminId });
  await knex('activities').update({ user_id: adminId });

  // 3. Hash the existing API_KEY env var and insert into api_keys
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const prefix = apiKey.substring(0, 8);

    await knex('api_keys').insert({
      id: crypto.randomUUID(),
      user_id: adminId,
      key_hash: keyHash,
      prefix: prefix,
      name: 'default',
      created_at: now,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert user_id back to 'owner'
  await knex('reminders').update({ user_id: 'owner' });
  await knex('memories').update({ user_id: 'owner' });
  await knex('tasks').update({ user_id: 'owner' });
  await knex('activities').update({ user_id: 'owner' });

  // Remove seeded data
  await knex('api_keys').del();
  await knex('users').where('is_admin', true).del();
}
