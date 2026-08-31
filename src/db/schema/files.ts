import { bigint, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { fk, pk, stamps } from './_shared';
import { users } from './access';

/**
 * فایل‌ها — معادلِ «کتابخانهٔ رسانه»‌ی سامانهٔ قبلی، ولی روی S3 (D-009).
 *
 * ⚠️ یک جدولِ مرکزی، نه یکی برای پیوست و یکی برای رسید: نقطهٔ پایانیِ
 * گیت‌شده باید **یک** جای واحد برای پیدا کردنِ فایل داشته باشد، وگرنه هر
 * مصرف‌کنندهٔ تازه یک مسیرِ سرو کردنِ تازه — و یک سوراخِ تازه — می‌سازد.
 */
export const files = pgTable('files', {
  id: pk(),
  /** کلیدِ شیء در S3 — همیشه تولیدِ ما، هرگز نامِ کاربر (R-FILE-06). */
  storageKey: text('storage_key').notNull().unique(),
  /**
   * کلیدِ نسخهٔ کوچکِ ۴۰۰ پیکسلی. null یعنی ندارد و باید اصلِ فایل سِرو شود.
   * ⚠️ ستونِ جدا، نه ردیفِ جدا: پیش‌نمایش عمرِ مستقل ندارد و با حذفِ فایل
   * باید برود (R-FILE-16).
   */
  previewKey: text('preview_key'),
  /** نوعِ **تأییدشده** با امضای بایت‌ها، نه آنچه مرورگر ادعا کرد (R-FILE-05). */
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  /** نامِ اصلی فقط برای هدرِ دانلود نگه داشته می‌شود، نه برای مسیر. */
  originalName: text('original_name').notNull().default(''),
  purpose: text('purpose').notNull().$type<'avatar' | 'receipt' | 'attachment'>(),
  uploadedBy: fk('uploaded_by').references(() => users.id),
  ...stamps,
}, (t) => [index('files_purpose_ix').on(t.purpose)]);

/** آواتارِ کاربر — تصویرِ شاخصِ فرد. */
export const userAvatars = pgTable('user_avatars', {
  userId: fk('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  fileId: bigint('file_id', { mode: 'number' }).notNull().references(() => files.id),
  ...stamps,
});
