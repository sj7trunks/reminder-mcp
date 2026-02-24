import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('memories', (table) => {
    table.uuid('chat_id').nullable()
      .references('id').inTable('chats').onDelete('SET NULL');
    table.index(['chat_id'], 'memories_chat_id_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('memories', (table) => {
    table.dropIndex(['chat_id'], 'memories_chat_id_idx');
    table.dropColumn('chat_id');
  });
}
