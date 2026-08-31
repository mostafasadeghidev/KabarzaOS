import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { EMAIL_CATEGORIES, categoryOf, matchesTarget, normalizeMuted, planDelivery, shouldPurge, type Recipient } from './gateway';

const r = (over: Partial<Recipient> = {}): Recipient => ({
  userId: 1, isInactive: false, hasEmail: true, hasTelegram: true, ...over,
});

describe('R-NOTIF-05 — دسته‌بندی و پیش‌فرضِ امن', () => {
  it('نوعِ شناخته‌شده دستهٔ خودش را می‌گیرد', () => {
    expect(categoryOf('task.assigned')).toBe('tasks');
    expect(categoryOf('payment')).toBe('money');
    expect(categoryOf('comment')).toBe('tasks');
    expect(categoryOf('meeting_soon')).toBe('meetings');
  });

  /**
   * گاردِ هم‌ترازی — پورتِ درسی که گران تمام شد.
   *
   * ⚠️ نگاشتِ دسته‌ها یک بار از واقعیت جدا افتاده بود: کلیدهایی نوشته شده بود
   * که هیچ‌جا منتشر نمی‌شدند و typeهای واقعی به `other` می‌افتادند. هیچ تستی
   * نمی‌شکست چون `categoryOf` همیشه **یک** جواب می‌دهد. این تست سورس را
   * می‌خواند و می‌گوید کدام typeِ منتشرشده نگاشت ندارد.
   */
  it('⚠️ هر نوعی که سرویس‌ها منتشر می‌کنند نگاشت دارد', () => {
    const emitted = new Set<string>();
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return full.endsWith('.ts') ? [full] : [];
      });

    for (const file of walk(join(process.cwd(), 'src', 'server'))) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/\btype:\s*'([a-z][a-z._]*)'/g)) emitted.add(m[1]!);
    }

    // خودِ اسکنر باید چیزی پیدا کند، وگرنه تست بی‌صدا سبز می‌ماند.
    expect(emitted.size).toBeGreaterThan(8);

    /**
     * این‌ها عمداً `other` هستند و هرگز خاموش نمی‌شوند — یادآورِ کارِ خودِ
     * کاربر و تغییری که دیگری در تقویمِ او داده.
     */
    const intentionallyOther = new Set(['no_timelog', 'timer_running', 'absence_set', 'user']);
    const unmapped = [...emitted]
      .filter((t) => !intentionallyOther.has(t) && categoryOf(t) === 'other');

    expect(unmapped, `نوعِ بدونِ دسته: ${unmapped.join(' · ')}`).toEqual([]);
  });

  it('⚠️ نوعِ ناشناخته «other» است، نه اینکه ساکت بماند', () => {
    // سکوتِ پیش‌فرض بدترین حالت است.
    expect(categoryOf('something.new')).toBe('other');
    const plan = planDelivery('something.new', [r({ mutedEmailCategories: ['tasks'] })]);
    expect(plan[0]!.email).toBe(true);
  });
});

describe('R-NOTIF-02 — عضوِ غیرفعال هیچ کانالی نمی‌گیرد', () => {
  it('⚠️ نه ایمیل، نه تلگرام، نه زنگِ داخلی', () => {
    const plan = planDelivery('task.assigned', [r({ isInactive: true })]);
    expect(plan).toEqual([]);
  });

  it('بقیهٔ گیرندگان تحتِ تأثیر قرار نمی‌گیرند', () => {
    const plan = planDelivery('task.assigned', [
      r({ userId: 1, isInactive: true }),
      r({ userId: 2 }),
    ]);
    expect(plan.map((p) => p.userId)).toEqual([2]);
  });
});

describe('R-NOTIF-04 — خاموش‌کردنِ دسته فقط ایمیل را ساکت می‌کند', () => {
  it('⚠️ زنگِ داخلی و تلگرام همچنان می‌روند', () => {
    // کاربر نباید هشداری را از دست بدهد؛ فقط ایمیلش شلوغ نشود.
    const plan = planDelivery('task.assigned', [r({ mutedEmailCategories: ['tasks'] })])[0]!;
    expect(plan.email).toBe(false);
    expect(plan.inApp).toBe(true);
    expect(plan.telegram).toBe(true);
  });

  it('دستهٔ دیگری خاموش باشد اثری ندارد', () => {
    const plan = planDelivery('task.assigned', [r({ mutedEmailCategories: ['money'] })])[0]!;
    expect(plan.email).toBe(true);
  });

  it('کانالِ وصل‌نشده استفاده نمی‌شود', () => {
    const plan = planDelivery('task.assigned', [r({ hasEmail: false, hasTelegram: false })])[0]!;
    expect(plan).toEqual({ userId: 1, inApp: true, email: false, telegram: false });
  });
});

describe('R-NOTIF-06 — اعلانِ خوانده‌نشده هرگز پاک نمی‌شود', () => {
  const cutoff = new Date('2026-08-01T00:00:00Z');
  const old = new Date('2026-07-01T00:00:00Z');
  const fresh = new Date('2026-08-20T00:00:00Z');

  it('خوانده‌شدهٔ قدیمی پاک می‌شود', () => {
    expect(shouldPurge({ isRead: true, createdAt: old }, cutoff)).toBe(true);
  });

  it('⚠️ خوانده‌نشدهٔ قدیمی می‌ماند', () => {
    expect(shouldPurge({ isRead: false, createdAt: old }, cutoff)).toBe(false);
  });

  it('خوانده‌شدهٔ تازه هم می‌ماند', () => {
    expect(shouldPurge({ isRead: true, createdAt: fresh }, cutoff)).toBe(false);
  });
});

describe('R-NOTIF-08 — تطبیقِ عددیِ دقیقِ هدف', () => {
  it('لینکِ همان گفتگو تطبیق می‌کند', () => {
    expect(matchesTarget('/messages/10', '/messages', 10)).toBe(true);
  });

  it('⚠️ «۱۰» با «۱۰۰» اشتباه گرفته نمی‌شود', () => {
    // با تطبیقِ متنی، بازکردنِ گفتگوی ۱۰ زنگِ گفتگوی ۱۰۰ را هم خاموش می‌کرد.
    expect(matchesTarget('/messages/100', '/messages', 10)).toBe(false);
    expect(matchesTarget('/messages/10', '/messages', 100)).toBe(false);
  });

  it('پارامتر و مسیرِ اضافه مزاحم نیست', () => {
    expect(matchesTarget('/messages/10?tab=x', '/messages', 10)).toBe(true);
    expect(matchesTarget('/messages/10/reply', '/messages', 10)).toBe(true);
  });

  it('پیشوندِ دیگر تطبیق نمی‌کند', () => {
    expect(matchesTarget('/projects/10', '/messages', 10)).toBe(false);
  });
});

describe('ترجیحاتِ ایمیل', () => {
  it('⚠️ دستهٔ «other» قابلِ خاموش‌کردن نیست', () => {
    expect(EMAIL_CATEGORIES.map((c) => c.key)).not.toContain('other');
    expect(normalizeMuted(['other', 'tasks'])).toEqual(['tasks']);
  });

  it('کلیدِ ناشناخته دور ریخته می‌شود و تکراری یکی می‌شود', () => {
    expect(normalizeMuted(['tasks', 'ای‌چیز', 'tasks', 'money'])).toEqual(['tasks', 'money']);
  });

  it('رویدادِ دسته‌بندی‌نشده حتی با فهرستِ پرِ بی‌صداها ایمیل می‌شود', () => {
    const plan = planDelivery('چیزِ تازه', [{
      userId: 1, isInactive: false, hasEmail: true, hasTelegram: false,
      mutedEmailCategories: EMAIL_CATEGORIES.map((c) => c.key),
    }]);
    expect(plan[0]!.email).toBe(true);
  });
});
