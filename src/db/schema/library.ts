import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pk, fk, ts, stamps } from './_shared';
import { users } from './access';
import { projects } from './projects';
import type {
  LibraryKind, LibraryLanguage, LibraryOptionKind, LibraryPlacement, LibraryPlatform, LibraryStatus,
} from '../../domain/library/kinds';

export * from '../../domain/library/kinds';

/**
 * کتابخانهٔ کد و راهنما (۲.۳۷.۰) — کدِ اختصاصی‌ای که برای پروژه‌ها نوشته
 * می‌شود، راهنمایی که کارفرما با آن تنظیماتش را عوض می‌کند، و یادداشتِ آموزشیِ تیم.
 *
 * ⚠️ «کلی» یا «اختصاصی» ستون ندارد: از فهرستِ پروژه‌هایی که مورد رویشان نصب
 * است (`library_projects`) معلوم می‌شود. کدی که امروز فقط برای یک پروژه نوشته
 * شد، فردا با یک پیوندِ تازه در پروژهٔ دوم هم هست — بی‌کپی، تا اصلاحِ یک‌جا
 * همه‌جا برسد. نسخهٔ جدا فقط وقتی ساخته می‌شود که کسی عمداً «نسخهٔ این پروژه»
 * را بخواهد (`forkedFromId`).
 */

export const libraryEntries = pgTable('library_entries', {
  id: pk(),
  kind: text('kind').notNull().default('code').$type<LibraryKind>(),
  title: text('title').notNull(),
  /** یک جمله: «این چه کار می‌کند» — روی کارت و بالای صفحه. */
  summary: text('summary').notNull().default(''),
  platform: text('platform').notNull().default('webflow').$type<LibraryPlatform>(),
  status: text('status').notNull().default('ready').$type<LibraryStatus>(),
  /** برچسب‌های آزاد («CMS»، «فرم»، «انیمیشن») — با پیشنهاد از برچسب‌های موجود. */
  topics: text('topics').array().notNull().default(sql`'{}'::text[]`),
  /** توضیح و یادداشتِ آزاد — پیوندِ Loom/YouTube زیرِ متن پخش می‌شود. */
  body: text('body').notNull().default(''),
  /** مراحلِ نصب یا استفاده، هر خط یک گام. */
  steps: text('steps').notNull().default(''),
  /** هشدارها («بعد از لیستِ CMS بگذار، نه در body»)، هر خط یکی. */
  warnings: text('warnings').notNull().default(''),
  /** پیش‌نیازها (کتابخانهٔ CDN، Finsweet…)، هر خط یکی. */
  dependencies: text('dependencies').notNull().default(''),
  /** نمونهٔ زنده یا صفحهٔ نمایش. */
  demoUrl: text('demo_url').notNull().default(''),
  /** فقط راهنمای کارفرما: کارفرمای پروژه‌های وصل‌شده آن را می‌بیند. */
  clientVisible: boolean('client_visible').notNull().default(false),
  /** پروژه‌ای که این مورد اول بار برایش نوشته شد. */
  originProjectId: fk('origin_project_id').references(() => projects.id, { onDelete: 'set null' }),
  /** نسخهٔ جدایی که از مورد دیگری گرفته شده. */
  forkedFromId: fk('forked_from_id').references((): AnyPgColumn => libraryEntries.id, { onDelete: 'set null' }),
  authorId: fk('author_id').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: fk('updated_by').references(() => users.id, { onDelete: 'set null' }),
  archivedAt: ts('archived_at'),
  ...stamps,
}, (t) => [
  check('library_entries_kind_ck', sql`${t.kind} in ('code','guide','note')`),
  check('library_entries_platform_ck', sql`${t.platform} in ('webflow','wordpress','shopify','html','other')`),
  check('library_entries_status_ck', sql`${t.status} in ('draft','ready','deprecated')`),
  index('library_entries_kind_ix').on(t.kind),
  index('library_entries_origin_ix').on(t.originProjectId),
  index('library_entries_author_ix').on(t.authorId),
]);

/** تکه‌کدهای یک مورد — هر کدام زبان و جای نصبِ خودش را دارد. */
export const libraryBlocks = pgTable('library_blocks', {
  id: pk(),
  entryId: fk('entry_id').notNull().references(() => libraryEntries.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default(''),
  language: text('language').notNull().default('js').$type<LibraryLanguage>(),
  placement: text('placement').notNull().default('site_body_end').$type<LibraryPlacement>(),
  /** جای دقیق، به زبانِ آدم: «درست بعد از لیستِ CMS ِ گالری». */
  placementNote: text('placement_note').notNull().default(''),
  code: text('code').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [
  check('library_blocks_language_ck', sql`${t.language} in ('html','css','js','json','php','liquid','text')`),
  check('library_blocks_placement_ck', sql`${t.placement} in ('site_head','site_body_end','page_head','page_body_end','embed','external','other')`),
  index('library_blocks_entry_ix').on(t.entryId),
]);

/**
 * گزینه‌های قابلِ تنظیم — مثلاً `data-flow-price` روی `.template-form-wrap`.
 * ⚠️ همین جدول است که «چطور استفاده کنم» را برای نفرِ بعدی روشن می‌کند:
 * نام، اینکه چه می‌کند، و مقدارِ پیش‌فرض.
 */
export const libraryOptions = pgTable('library_options', {
  id: pk(),
  entryId: fk('entry_id').notNull().references(() => libraryEntries.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('attribute').$type<LibraryOptionKind>(),
  description: text('description').notNull().default(''),
  defaultValue: text('default_value').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [
  check('library_options_kind_ck', sql`${t.kind} in ('attribute','class','id','variable','setting')`),
  index('library_options_entry_ix').on(t.entryId),
]);

/** «روی کدام پروژه‌ها نصب است» — با یادداشتِ جای نصب و مقدارهای همان پروژه. */
export const libraryProjects = pgTable('library_projects', {
  id: pk(),
  entryId: fk('entry_id').notNull().references(() => libraryEntries.id, { onDelete: 'cascade' }),
  projectId: fk('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  /** کجای سایت: «صفحهٔ قیمت‌ها، بخشِ فرم». */
  note: text('note').notNull().default(''),
  /** مقدارهایی که در این پروژه با پیش‌فرض فرق دارند. */
  valuesNote: text('values_note').notNull().default(''),
  installedBy: fk('installed_by').references(() => users.id, { onDelete: 'set null' }),
  ...stamps,
}, (t) => [
  uniqueIndex('library_projects_uq').on(t.entryId, t.projectId),
  index('library_projects_project_ix').on(t.projectId),
]);

/**
 * موردهای مرتبط — مثلاً کدِ قیمت‌گذاری ↔ راهنمای کارفرمایش.
 * ⚠️ هر جفت یک بار و با ترتیبِ ثابت (`entry_id < related_id`) ذخیره می‌شود.
 */
export const libraryRelations = pgTable('library_relations', {
  entryId: fk('entry_id').notNull().references(() => libraryEntries.id, { onDelete: 'cascade' }),
  relatedId: fk('related_id').notNull().references(() => libraryEntries.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.entryId, t.relatedId] }),
  check('library_relations_order_ck', sql`${t.entryId} < ${t.relatedId}`),
  index('library_relations_related_ix').on(t.relatedId),
]);

/** تاریخچه — عکسِ مورد **پیش از** هر ویرایش، تا کدِ قبلی گم نشود. */
export const libraryRevisions = pgTable('library_revisions', {
  id: pk(),
  entryId: fk('entry_id').notNull().references(() => libraryEntries.id, { onDelete: 'cascade' }),
  authorId: fk('author_id').references(() => users.id, { onDelete: 'set null' }),
  snapshot: jsonb('snapshot').notNull(),
  createdAt: stamps.createdAt,
}, (t) => [index('library_revisions_entry_ix').on(t.entryId, t.createdAt)]);
