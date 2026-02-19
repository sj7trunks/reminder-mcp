import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg';

  if (isPostgres) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');
  }

  await knex.schema.alterTable('memories', (table) => {
    if (isPostgres) {
      table.specificType('embedding', 'vector(1536)').nullable();
    }
    table.string('embedding_status', 20).nullable().defaultTo(null);
    table.string('embedding_model', 50).nullable().defaultTo(null);
    table.text('embedding_error').nullable().defaultTo(null);
  });

  if (isPostgres) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS memories_embedding_idx
      ON memories
      USING hnsw (embedding vector_cosine_ops)
    `);
  }

  await knex.schema.alterTable('memories', (table) => {
    table.index(['embedding_status'], 'memories_embedding_status_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg';

  await knex.schema.alterTable('memories', (table) => {
    table.dropIndex(['embedding_status'], 'memories_embedding_status_idx');
  });

  if (isPostgres) {
    await knex.raw('DROP INDEX IF EXISTS memories_embedding_idx');
  }

  await knex.schema.alterTable('memories', (table) => {
    table.dropColumns('embedding_status', 'embedding_model', 'embedding_error');
    if (isPostgres) {
      table.dropColumn('embedding');
    }
  });
}
