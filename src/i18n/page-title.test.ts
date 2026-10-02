import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ⚠️ کلیدِ `pageTitle('…')` را استخراج‌گرِ ترجمه نمی‌بیند (فقط فراخوانیِ صریحِ
 * مترجم را می‌شناسد)؛ عنوانِ تبی که کلیدش در فایلِ زبان نباشد برای غیرفارسی‌زبان
 * فارسی می‌ماند. این تست جای آن استخراج‌گر را برای عنوان‌ها می‌گیرد.
 */
const LOCALES = ['en', 'ar', 'ckb', 'de', 'es', 'fr', 'pt', 'tr'];

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? pages(full) : entry === 'page.tsx' ? [full] : [];
  });
}

describe('عنوانِ تبِ صفحه‌ها', () => {
  const keys = new Map<string, string>();
  for (const file of pages(join(process.cwd(), 'src', 'app'))) {
    const m = /pageTitle\('([^']+)'\)/.exec(readFileSync(file, 'utf8'));
    if (m) keys.set(file, m[1]!);
  }

  it('بیشترِ صفحه‌ها عنوان دارند — اسکنر چیزی پیدا می‌کند', () => {
    expect(keys.size).toBeGreaterThan(25);
  });

  it('⚠️ کلیدِ هر عنوان در هر هشت زبان ترجمه دارد', () => {
    for (const locale of LOCALES) {
      const messages = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'));
      const missing = [...new Set(keys.values())].filter((k) => !messages[k]);
      expect(missing, `${locale}: ${missing.join(' · ')}`).toEqual([]);
    }
  });
});
