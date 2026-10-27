import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const accessGrants = sqliteTable('access_grants', {
  articleId: text('article_id').notNull(),
  publicKey: text('public_key').notNull(),
  protocolVersion: integer('protocol_version').notNull(),
}, table => [primaryKey({ columns: [table.articleId, table.publicKey, table.protocolVersion] })]);
