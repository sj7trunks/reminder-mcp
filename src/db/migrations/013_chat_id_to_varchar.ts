import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg';

  if (isPostgres) {
    // Drop FK constraint, change column types, re-add FK
    await knex.raw('ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_chat_id_foreign');
    await knex.raw('ALTER TABLE memories ALTER COLUMN chat_id TYPE varchar(255)');
    await knex.raw('ALTER TABLE chats ALTER COLUMN id TYPE varchar(255)');
    await knex.raw(`
      ALTER TABLE memories
      ADD CONSTRAINT memories_chat_id_foreign
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL
    `);
  } else {
    // SQLite: recreate tables (SQLite doesn't support ALTER COLUMN)
    // For SQLite the columns are already loosely typed, so this is a no-op
  }
}

export async function down(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg';

  if (isPostgres) {
    await knex.raw('ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_chat_id_foreign');
    await knex.raw('ALTER TABLE memories ALTER COLUMN chat_id TYPE uuid USING chat_id::uuid');
    await knex.raw('ALTER TABLE chats ALTER COLUMN id TYPE uuid USING id::uuid');
    await knex.raw(`
      ALTER TABLE memories
      ADD CONSTRAINT memories_chat_id_foreign
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL
    `);
  }
}
