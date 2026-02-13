import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('activities', (table) => {
    table.uuid('id').primary();
    table.string('user_id').notNullable().index();
    table.enum('type', ['reminder', 'memory', 'task', 'query']).notNullable().index();
    table.string('action').notNullable();
    table.uuid('entity_id');
    table.json('metadata').defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now()).index();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('activities');
}
