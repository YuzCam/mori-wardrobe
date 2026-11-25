import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const garments = sqliteTable(
  'garments',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    data: text('data').notNull(),
    importKey: text('import_key'),
    revision: integer('revision').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('garments_owner_date').on(t.owner, t.createdAt),
    index('garments_owner_category').on(t.owner, t.category),
    uniqueIndex('garments_import_key').on(t.owner, t.importKey),
  ],
);
export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    garmentId: text('garment_id').notNull(),
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
  },
  (t) => [index('assets_garment').on(t.owner, t.garmentId)],
);
export const outfits = sqliteTable(
  'outfits',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    date: text('date').notNull(),
    data: text('data').notNull(),
    favorite: integer('favorite').notNull().default(0),
    worn: integer('worn').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('outfits_owner_date').on(t.owner, t.date)],
);
export const preferences = sqliteTable('preferences', {
  owner: text('owner').primaryKey(),
  data: text('data').notNull(),
});
export const recognitionRuns = sqliteTable('recognition_runs', {
  id: text('id').primaryKey(),
  garmentId: text('garment_id').notNull(),
  owner: text('owner').notNull(),
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
});
