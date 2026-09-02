import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_LABELS, actionLabel } from '../labels';

/**
 * گاردِ برچسبِ رویدادها.
 *
 * ⚠️ چرا اسکنِ سورس و نه یک فهرستِ دستی؟ چون یادِ آدم می‌رود: هر سرویسِ تازه‌ای
 * که `audit(...)` بنویسد، بدونِ این تست کلیدِ خام را به صفحهٔ فعالیت می‌فرستد و
 * کاربر «person.permissions» می‌بیند. این تست همان لحظه می‌شکند.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * کلیدهای ثابتِ رویداد — از **دو** شکلِ نوشتن.
 *
 * ⚠️ شکلِ دوم بعداً اضافه شد: سرویسی که به‌جای کمکیِ `audit(...)` مستقیم
 * `db.insert(auditLog).values({ action: '…' })` می‌نوشت از چشمِ گارد
 * می‌افتاد — یعنی دقیقاً همان «کلیدِ خام در صفحهٔ فعالیت» که این تست قرار
 * بود جلویش را بگیرد، از راهِ دیگری برمی‌گشت.
 */
function staticActionKeys(): string[] {
  const keys = new Set<string>();
  const patterns = [
    /audit\(\s*actor\s*,\s*'([a-z.]+)'/g,
    /\baction:\s*'([a-z][a-z.]*\.[a-z.]+)'/g,
  ];
  for (const file of walk(join(process.cwd(), 'src', 'server'))) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) keys.add(match[1]!);
    }
  }
  return [...keys].sort();
}

describe('برچسبِ رویدادها', () => {
  it('هر کلیدِ ممیزیِ ثابت برچسب دارد', () => {
    const missing = staticActionKeys().filter((key) => !(key in ACTION_LABELS));
    expect(missing).toEqual([]);
  });

  it('کلیدها واقعاً پیدا می‌شوند (خودِ اسکنر سالم است)', () => {
    // اگر الگوی regex روزی بی‌صدا خراب شود، تستِ بالا الکی سبز می‌ماند.
    expect(staticActionKeys().length).toBeGreaterThan(20);
    expect(staticActionKeys()).toContain('ledger.create');
  });

  it('خانواده‌های پویا هم پوشش دارند', () => {
    // این‌ها با رشتهٔ قالبی ساخته می‌شوند و از دیدِ اسکنر پنهان‌اند.
    for (const key of [
      'person.remove.detached', 'person.remove.deactivated',
      'person.remove.deleted', 'person.remove.noop',
      // ⚠️ همان مقادیری که lifecycle.ts واقعاً می‌نویسد — نه soft/hard که هرگز نوشته نمی‌شد.
      'project.delete.none', 'project.delete.detach', 'project.delete.purge',
      'request.approved', 'request.rejected',
    ]) {
      expect(ACTION_LABELS[key], key).toBeDefined();
    }
  });

  it('کلیدِ ناشناخته خودش نمایش داده می‌شود، نه رشتهٔ خالی', () => {
    expect(actionLabel('something.new')).toBe('something.new');
  });
});
