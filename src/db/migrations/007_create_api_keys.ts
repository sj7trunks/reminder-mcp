import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('api_keys', (table) => {
    table.uuid('id').primary();
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('key_hash').notNullable(); // SHA-256 hex hash for O(1) lookup
    table.string('prefix', 8).notNullable(); // first 8 chars for display
    table.text('name').defaultTo('default');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // Index on key_hash for fast lookups
  await knex.schema.alterTable('api_keys', (table) => {
    table.index('key_hash');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('api_keys');
}
