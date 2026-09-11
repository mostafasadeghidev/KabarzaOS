import { describe, it, expect } from 'vitest';
import { filterLogs, localIsoDate, logMembers, totalMinutes } from './log-filter';

const rows = [
  { id: 1, userId: 7, userName: 'سارا', logDate: '2026-09-10', minutes: 90 },
  { id: 2, userId: 3, userName: 'علی', logDate: '2026-09-10', minutes: 30 },
  { id: 3, userId: 7, userName: 'سارا', logDate: '2026-09-09', minutes: 45 },
  { id: 4, userId: 12, userName: null, logDate: '2026-09-08', minutes: 15 },
];

const none = { userId: '', from: '', to: '' };
const ids = (list: Array<{ id: number }>) => list.map((r) => r.id);

describe('فیلترِ جزئیاتِ ثبت‌ها', () => {
  it('بدونِ فیلتر همه می‌مانند', () => {
    expect(filterLogs(rows, none)).toHaveLength(4);
  });

  it('فقط ثبت‌های همان عضو', () => {
    expect(ids(filterLogs(rows, { ...none, userId: '7' }))).toEqual([1, 3]);
  });

  it('بازهٔ تاریخ — هر دو سر شاملِ بازه‌اند', () => {
    expect(ids(filterLogs(rows, { ...none, from: '2026-09-09', to: '2026-09-10' }))).toEqual([1, 2, 3]);
    expect(ids(filterLogs(rows, { ...none, from: '2026-09-10', to: '2026-09-10' }))).toEqual([1, 2]);
  });

  it('یک سرِ بازه می‌تواند باز باشد', () => {
    expect(ids(filterLogs(rows, { ...none, from: '2026-09-09' }))).toEqual([1, 2, 3]);
    expect(ids(filterLogs(rows, { ...none, to: '2026-09-08' }))).toEqual([4]);
  });

  it('عضو و بازه با هم', () => {
    expect(ids(filterLogs(rows, { userId: '7', from: '2026-09-10', to: '2026-09-30' }))).toEqual([1]);
    expect(filterLogs(rows, { userId: '3', from: '2026-09-01', to: '2026-09-09' })).toEqual([]);
  });

  it('فهرستِ اعضا: هر نفر یک بار، به ترتیبِ نام؛ بی‌نام با شناسه', () => {
    expect(logMembers(rows)).toEqual([
      { id: 12, name: '#12' },
      { id: 7, name: 'سارا' },
      { id: 3, name: 'علی' },
    ]);
  });

  it('مجموعِ دقیقه‌های ثبت‌های منطبق', () => {
    expect(totalMinutes(filterLogs(rows, { ...none, userId: '7' }))).toBe(135);
    expect(totalMinutes([])).toBe(0);
  });

  it('امروز به تاریخِ محلی، نه UTC', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
    expect(localIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});
