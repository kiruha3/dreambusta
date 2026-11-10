import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const books = sqliteTable('books', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author').notNull().default(''),
  format: text('format').notNull(),
  originalName: text('original_name').notNull(),
  wordCount: integer('word_count').notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull(),
});
