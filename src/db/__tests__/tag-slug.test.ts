import { describe, it, expect, beforeAll } from 'vitest';
import { db, sql } from '../client';
import { tags } from '../schema';

/**
 * مهاجرتِ 0031 — یک اسلاگ، یک تگ.
 *
 * ⚠️ اسلاگ راهِ پیدا کردنِ تگِ کاتالوگ است (مهاجرت‌های 0019 و 0030، `next-up`
 * در وابستگیِ تسک). دو ردیف با یک اسلاگ یعنی جستجو یکی از دو را تصادفی
 * برمی‌داشت — همان چیزی که پایگاهِ محلی را به وضعیت‌های تکراری کشاند.
 */
describe('اسلاگِ تگ یکتاست', () => {
  beforeAll(async () => {
    await sql`truncate table tags restart identity cascade`;
  });

  it('دو تگ با یک اسلاگِ غیرِخالی ساخته نمی‌شوند', async () => {
    await db.insert(tags).values({ name: 'الف', type: 'task_status', slug: 'dup-slug' });
    await expect(
      db.insert(tags).values({ name: 'ب', type: 'task_status', slug: 'dup-slug' }),
    ).rejects.toThrow();
  });

  it('اسلاگِ خالی چند بار مجاز است — تگِ تازه پیش از گرفتنِ `type-id`', async () => {
    await db.insert(tags).values([
      { name: 'ج', type: 'task_status' },
      { name: 'د', type: 'task_status' },
    ]);
    const rows = await db.select({ slug: tags.slug }).from(tags);
    expect(rows.filter((r) => r.slug === '')).toHaveLength(2);
  });
});
