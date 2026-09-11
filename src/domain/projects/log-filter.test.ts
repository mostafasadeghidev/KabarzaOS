import { describe, it, expect } from 'vitest';
import { filterLogs, logMembers, totalMinutes } from './log-filter';

const rows = [
  { id: 1, userId: 7, userName: 'سارا', logDate: '2026-09-10', minutes: 90 },
  { id: 2, userId: 3, userName: 'علی', logDate: '2026-09-10', minutes: 30 },
  { id: 3, userId: 7, userName: 'سارا', logDate: '2026-09-09', minutes: 45 },
  { id: 4, userId: 12, userName: null, logDate: '2026-09-08', minutes: 15 },
];

describe('فیلترِ جزئیاتِ ثبت‌ها', () => {
  it('بدونِ فیلتر همه می‌مانند', () => {
    expect(filterLogs(rows, { userId: '', date: '' })).toHaveLength(4);
  });

  it('فقط ثبت‌های همان عضو', () => {
    expect(filterLogs(rows, { userId: '7', date: '' }).map((r) => r.id)).toEqual([1, 3]);
  });

  it('فقط ثبت‌های همان روز', () => {
    expect(filterLogs(rows, { userId: '', date: '2026-09-10' }).map((r) => r.id)).toEqual([1, 2]);
  });

  it('عضو و روز با هم', () => {
    expect(filterLogs(rows, { userId: '7', date: '2026-09-10' }).map((r) => r.id)).toEqual([1]);
    expect(filterLogs(rows, { userId: '3', date: '2026-09-09' })).toEqual([]);
  });

  it('فهرستِ اعضا: هر نفر یک بار، به ترتیبِ نام؛ بی‌نام با شناسه', () => {
    expect(logMembers(rows)).toEqual([
      { id: 12, name: '#12' },
      { id: 7, name: 'سارا' },
      { id: 3, name: 'علی' },
    ]);
  });

  it('مجموعِ دقیقه‌های ثبت‌های منطبق', () => {
    expect(totalMinutes(filterLogs(rows, { userId: '7', date: '' }))).toBe(135);
    expect(totalMinutes([])).toBe(0);
  });
});
