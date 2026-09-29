import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@/domain/access/guard';

/**
 * نگهبانِ کلیدِ `ForbiddenError`.
 *
 * ⚠️ چرا این تست وجود دارد: `ForbiddenError('email.taken')` کلید را در
 * `required` نگه می‌دارد و `message` اش «forbidden: requires email.taken»
 * است. پانزده جا در اقدام‌ها `error.message === 'email.taken'` نوشته بود؛ مقایسه
 * هرگز درست نمی‌شد و کاربر به‌جای «این ایمیل قبلاً ثبت شده» یا «پنجرهٔ ویرایش
 * بسته شده» پیامِ کلیِ «دسترسی ندارید» می‌دید. تایپ‌چک هیچ‌کدام را نمی‌گرفت.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
  });
}

describe('کلیدِ ForbiddenError', () => {
  it('کلید در `required` است، نه در `message`', () => {
    const error = new ForbiddenError('email.taken');
    expect(error.required).toBe('email.taken');
    expect(error.message).not.toBe('email.taken');
  });

  it('⚠️ هیچ کدی کلید را با `error.message` مقایسه نمی‌کند', () => {
    const offenders = walk('src').filter((file) =>
      /error\.message\s*===\s*'[a-z_]+\.[a-z_.]+'/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
