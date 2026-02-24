import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('chats', (table) => {
    table.uuid('id').primary();
    table.uuid('user_id').notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id'], 'chats_user_id_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('chats');
}
