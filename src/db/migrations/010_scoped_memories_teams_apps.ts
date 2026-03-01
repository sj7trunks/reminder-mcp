import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create teams table
  await knex.schema.createTable('teams', (table) => {
    table.uuid('id').primary();
    table.text('name').notNullable();
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Create team_memberships table
  await knex.schema.createTable('team_memberships', (table) => {
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('team_id').notNullable().references('id').inTable('teams').onDelete('CASCADE');
    table.string('role', 10).notNullable().defaultTo('member'); // 'admin' | 'member'
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.primary(['user_id', 'team_id']);
  });

  // Create applications table
  await knex.schema.createTable('applications', (table) => {
    table.uuid('id').primary();
    table.text('name').notNullable();
    table.uuid('team_id').nullable().references('id').inTable('teams').onDelete('SET NULL');
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Alter memories table — add scope columns
  await knex.schema.alterTable('memories', (table) => {
    table.string('scope', 20).notNullable().defaultTo('personal');
    table.uuid('scope_id').nullable();
    table.uuid('author_id').nullable();
    table.uuid('promoted_from').nullable();
    table.uuid('superseded_by').nullable();
    table.integer('retrieval_count').notNullable().defaultTo(0);
    table.timestamp('last_retrieved_at').nullable();
    table.string('classification', 20).nullable();

    table.index(['scope', 'scope_id'], 'memories_scope_scope_id_idx');
    table.index(['author_id'], 'memories_author_id_idx');
  });

  // Alter api_keys table — add scope columns
  await knex.schema.alterTable('api_keys', (table) => {
    table.string('scope_type', 10).notNullable().defaultTo('user');
    table.uuid('team_id').nullable().references('id').inTable('teams').onDelete('CASCADE');
  });

  // Data migration: set author_id = user_id for existing memories
  await knex.raw('UPDATE memories SET author_id = user_id::uuid');
}

export async function down(knex: Knex): Promise<void> {
  // Remove api_keys columns
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropColumn('team_id');
    table.dropColumn('scope_type');
  });

  // Remove memories columns
  await knex.schema.alterTable('memories', (table) => {
    table.dropIndex([], 'memories_author_id_idx');
    table.dropIndex([], 'memories_scope_scope_id_idx');
    table.dropColumns(
      'scope', 'scope_id', 'author_id', 'promoted_from',
      'superseded_by', 'retrieval_count', 'last_retrieved_at', 'classification'
    );
  });

  // Drop tables in reverse order
  await knex.schema.dropTable('applications');
  await knex.schema.dropTable('team_memberships');
  await knex.schema.dropTable('teams');
}
