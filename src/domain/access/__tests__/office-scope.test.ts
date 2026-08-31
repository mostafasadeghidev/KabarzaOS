import { describe, expect, it } from 'vitest';
import {
  canMonitor, csvCell, csvDocument, csvRow, isOfficeManager,
  monitorableUserIds, resolveRange,
} from '../office-scope';

describe('مدیرِ دفتر', () => {
  it('⚠️ پرچمِ بدونِ دفتر، مدیرِ دفتر نیست', () => {
    // منویی که همیشه خالی است فقط سردرگم‌کننده است.
    expect(isOfficeManager([])).toBe(false);
    expect(isOfficeManager([3])).toBe(true);
  });

  it('⚠️ کارکنانِ پروژه هم قابلِ پایش‌اند، نه فقط اعضای دفتر', () => {
    // وگرنه دکمهٔ «جزئیات» ِ ردیفِ حسابدار در جدولِ ساعت کار نمی‌کرد.
    const ids = monitorableUserIds({ officeMemberIds: [1, 2], projectWorkerIds: [2, 7] });
    expect(ids.sort()).toEqual([1, 2, 7]);
  });

  it('تکراری‌ها یک‌بار می‌مانند', () => {
    expect(monitorableUserIds({ officeMemberIds: [5], projectWorkerIds: [5] })).toEqual([5]);
  });

  it('پایشِ کسی خارج از دامنه ممنوع است', () => {
    expect(canMonitor(9, [1, 2])).toBe(false);
    expect(canMonitor(2, [1, 2])).toBe(true);
  });
});

describe('بازهٔ گزارش', () => {
  const now = new Date('2026-05-15T12:00:00Z');

  it('پیش‌فرض هفتگی است', () => {
    const r = resolveRange({}, now);
    expect(r.range).toBe('week');
    expect(r.from).toBe('2026-05-08');
    expect(r.to).toBe('2026-05-15');
  });

  it('ماهانه یک ماه به عقب می‌رود', () => {
    expect(resolveRange({ range: 'month' }, now).from).toBe('2026-04-15');
  });

  it('⚠️ «همه» بدونِ کران است، نه یک تاریخِ قدیمیِ حدسی', () => {
    // وگرنه ردیف‌های قدیمی‌تر بی‌صدا از گزارش می‌افتند.
    const r = resolveRange({ range: 'all' }, now);
    expect(r.from).toBeNull();
    expect(r.to).toBeNull();
  });

  it('بازهٔ دلخواه همان است که داده شده', () => {
    const r = resolveRange({ range: 'custom', from: '2026-01-01', to: '2026-02-01' }, now);
    expect([r.from, r.to]).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('بازهٔ وارونه جابه‌جا می‌شود', () => {
    const r = resolveRange({ range: 'custom', from: '2026-03-01', to: '2026-01-01' }, now);
    expect([r.from, r.to]).toEqual(['2026-01-01', '2026-03-01']);
  });

  it('بازهٔ ناشناخته به هفتگی برمی‌گردد', () => {
    expect(resolveRange({ range: 'چیزِ عجیب' }, now).range).toBe('week');
  });
});

describe('CSV', () => {
  it('گیومه با دو گیومه فرار می‌شود', () => {
    expect(csvCell('او گفت "سلام"')).toBe('"او گفت ""سلام"""');
  });

  it('⚠️ خانهٔ فرمول‌نما بی‌اثر می‌شود — تزریقِ فرمولِ اکسل', () => {
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell('+A1')).toBe(`"'+A1"`);
    expect(csvCell('-2')).toBe(`"'-2"`);
    expect(csvCell('@cmd')).toBe(`"'@cmd"`);
  });

  it('ویرگول و خطِ تازه ستون‌ها را نمی‌شکنند', () => {
    expect(csvRow(['a,b', 'c\nd'])).toBe('"a,b","c\nd"');
  });

  it('خالی و null خانهٔ خالی می‌دهند', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it('⚠️ سند با BOM شروع می‌شود تا اکسلِ ویندوز فارسی را درست بخواند', () => {
    const doc = csvDocument(['نام'], [['سارا']]);
    expect(doc.charCodeAt(0)).toBe(0xfeff);
    expect(doc).toContain('"سارا"');
    expect(doc.endsWith('\r\n')).toBe(true);
  });
});
