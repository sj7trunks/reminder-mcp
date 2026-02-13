import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reminders', (table) => {
    table.uuid('id').primary();
    table.string('user_id').notNullable().index();
    table.text('title').notNullable();
    table.text('description');
    table.timestamp('due_at').notNullable().index();
    table.string('timezone').notNullable().defaultTo('UTC');
    table
      .enum('status', ['pending', 'triggered', 'completed', 'cancelled'])
      .notNullable()
      .defaultTo('pending')
      .index();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('reminders');
}
