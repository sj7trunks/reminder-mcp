import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // SQLite doesn't support DROP COLUMN directly in older versions,
  // but knex handles this by recreating the table
  await knex.schema.alterTable('reminders', (table) => {
    table.dropColumn('timezone');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('reminders', (table) => {
    table.string('timezone').notNullable().defaultTo('UTC');
  });
}
