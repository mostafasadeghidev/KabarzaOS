import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * گاردِ سیاههٔ مهاجرت‌ها.
 *
 * ⚠️ ماجرا: دو مهاجرت هم‌زمان `idx: 5` و همان `when` گرفتند. drizzle
 * **بی‌صدا** فقط یکی را اجرا کرد و «migrations applied» چاپ شد — جدولِ دومی
 * هرگز ساخته نشد و تا وقتی دستی سراغش نرفتم معلوم نشد. روی تولید یعنی
 * دیپلویِ موفق با اسکیمای ناقص.
 *
 * این تست همان را می‌گیرد. عمداً **تستِ واحد** است، نه یکپارچه: به دیتابیس
 * نیاز ندارد و در هر اجرا می‌دود.
 */

const DIR = join(process.cwd(), 'src', 'db', 'migrations');

interface Entry {
  idx: number;
  tag: string;
  when: number;
}

function journal(): Entry[] {
  const raw = readFileSync(join(DIR, 'meta', '_journal.json'), 'utf8');
  return (JSON.parse(raw) as { entries: Entry[] }).entries;
}

describe('سیاههٔ مهاجرت‌ها', () => {
  it('⚠️ هیچ دو مهاجرتی idx یکسان ندارند', () => {
    const seen = journal().map((e) => e.idx);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('⚠️ هیچ دو مهاجرتی مهرِ زمانیِ یکسان ندارند', () => {
    const seen = journal().map((e) => e.when);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('idx ها پشتِ‌سرِ هم و از صفر شروع می‌شوند', () => {
    const idx = journal().map((e) => e.idx);
    expect(idx).toEqual(idx.map((_, i) => i));
  });

  it('مهرِ زمانی صعودی است — ترتیبِ اجرا همان ترتیبِ نوشتن باشد', () => {
    const when = journal().map((e) => e.when);
    expect([...when].sort((a, b) => a - b)).toEqual(when);
  });

  it('هر ردیفِ سیاهه فایلِ خودش را دارد', () => {
    const files = new Set(readdirSync(DIR).filter((f) => f.endsWith('.sql')));
    for (const entry of journal()) {
      expect(files.has(`${entry.tag}.sql`), entry.tag).toBe(true);
    }
  });

  it('⚠️ هیچ فایلِ SQL ِ بی‌ردیف در سیاهه نمانده', () => {
    // فایلی که در سیاهه نباشد هرگز اجرا نمی‌شود و کسی هم خبردار نمی‌شود.
    const tags = new Set(journal().map((e) => e.tag));
    const orphans = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.replace(/\.sql$/, ''))
      .filter((tag) => !tags.has(tag));
    expect(orphans).toEqual([]);
  });
});
