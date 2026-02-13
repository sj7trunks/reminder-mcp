import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('memories', (table) => {
    table.uuid('id').primary();
    table.string('user_id').notNullable().index();
    table.text('content').notNullable();
    table.json('tags').defaultTo('[]');
    table.integer('recalled_count').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('memories');
}
