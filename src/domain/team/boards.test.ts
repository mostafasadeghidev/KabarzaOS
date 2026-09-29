import { describe, expect, it } from 'vitest';
import {
  assigneeParam, groupTabs, inGroup, pageOf, paginate, parseAssignee, perPageOf, progressPercent,
} from './boards';

describe('فیلترِ عضو / نقش', () => {
  it('شکل‌های نسخهٔ قبلی را می‌خواند', () => {
    expect(parseAssignee('u:7')).toEqual({ kind: 'user', id: 7 });
    expect(parseAssignee('r:3')).toEqual({ kind: 'role', id: 3 });
  });

  it('«کارهای این عضو» برای دریل‌داونِ پروفایل', () => {
    expect(parseAssignee('m:5')).toEqual({ kind: 'member', id: 5 });
  });

  it('لینک‌های قدیمیِ خودمان نمی‌شکنند', () => {
    expect(parseAssignee('7')).toEqual({ kind: 'user', id: 7 });
    expect(parseAssignee('0')).toEqual({ kind: 'none' });
  });

  it('⚠️ مقدارِ نامعتبر یعنی بی‌فیلتر، نه بردِ خالی', () => {
    expect(parseAssignee('')).toBeNull();
    expect(parseAssignee(undefined)).toBeNull();
    expect(parseAssignee('x:5')).toBeNull();
    expect(parseAssignee('u:-2')).toBeNull();
    expect(parseAssignee('u:abc')).toBeNull();
  });

  it('رفت‌وبرگشت با آدرس', () => {
    for (const raw of ['u:4', 'r:9', 'm:3', '0']) expect(assigneeParam(parseAssignee(raw))).toBe(raw);
    expect(assigneeParam(null)).toBe('');
  });
});

describe('صفحه‌بندی', () => {
  it('فقط چهار گزینهٔ مجاز؛ بقیه پیش‌فرض ۲۵', () => {
    expect(perPageOf('10')).toBe(10);
    expect(perPageOf(100)).toBe(100);
    expect(perPageOf('7')).toBe(25);
    expect(perPageOf(undefined)).toBe(25);
  });

  it('صفحهٔ بیرون از بازه به نزدیک‌ترین صفحهٔ موجود می‌رود', () => {
    expect(pageOf('9', 30, 10)).toBe(3);
    expect(pageOf('0', 30, 10)).toBe(1);
    expect(pageOf('abc', 0, 10)).toBe(1);
  });

  it('برشِ درست', () => {
    const pg = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(pg.items).toEqual([3, 4]);
    expect(pg.totalPages).toBe(3);
  });
});

describe('تب‌های گروهِ وضعیت', () => {
  const rows = [
    { statusGroup: 'in_progress' }, { statusGroup: 'in_progress' },
    { statusGroup: 'completed' }, { statusGroup: null }, { statusGroup: 'weird' },
  ];

  it('گروهِ خالی تب ندارد؛ «همه» همه را می‌شمارد', () => {
    const tabs = groupTabs(rows);
    expect(tabs.all).toBe(5);
    expect(tabs.groups).toEqual([{ key: 'in_progress', count: 2 }, { key: 'completed', count: 1 }]);
  });

  it('پروژهٔ بی‌گروه فقط زیرِ «همه»', () => {
    expect(inGroup({ statusGroup: null }, null)).toBe(true);
    expect(inGroup({ statusGroup: null }, 'in_progress')).toBe(false);
  });

  it('پیشرفتِ بی‌تسک صفر است', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(1, 3)).toBe(33);
  });
});
