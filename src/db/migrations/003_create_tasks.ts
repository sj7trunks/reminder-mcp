import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tasks', (table) => {
    table.uuid('id').primary();
    table.string('user_id').notNullable().index();
    table.text('title').notNullable();
    table.text('command');
    table
      .enum('status', ['pending', 'in_progress', 'completed', 'failed'])
      .notNullable()
      .defaultTo('pending')
      .index();
    table.integer('check_interval_ms').notNullable().defaultTo(300000);
    table.timestamp('last_check_at');
    table.timestamp('next_check_at').index();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('tasks');
}
