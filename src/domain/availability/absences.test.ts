import { describe, expect, it } from 'vitest';
import {
  adjacencyWindow, cleanDate, joinNotes, normalizeRange, planAbsence, type AbsenceRow,
} from './absences';

const row = (over: Partial<AbsenceRow> = {}): AbsenceRow => ({
  id: 1, fromDate: '2026-03-10', toDate: '2026-03-12', note: '', ...over,
});

describe('مرخصیِ موردی', () => {
  it('تاریخِ نامعتبر رد می‌شود', () => {
    expect(cleanDate('2026-03-10')).toBe('2026-03-10');
    expect(cleanDate('10/03/2026')).toBe('');
    expect(cleanDate('')).toBe('');
    expect(cleanDate(null)).toBe('');
    // ⚠️ زمانِ چسبیده بریده می‌شود، نه اینکه کلِ مقدار دور ریخته شود.
    expect(cleanDate('2026-03-10T08:00:00Z')).toBe('2026-03-10');
  });

  it('بازهٔ برعکس جابه‌جا می‌شود، نه خطا', () => {
    expect(normalizeRange('2026-03-12', '2026-03-10'))
      .toEqual({ from: '2026-03-10', to: '2026-03-12' });
    expect(normalizeRange('2026-03-10', 'x')).toBeNull();
  });

  it('پنجرهٔ مجاورت یک روز از هر طرف باز است', () => {
    // ⚠️ بدونِ این، مرخصیِ چسبیده ادغام نمی‌شد و دو ردیفِ تکه‌تکه می‌ماند.
    expect(adjacencyWindow('2026-03-10', '2026-03-12'))
      .toEqual({ lo: '2026-03-09', hi: '2026-03-13' });
  });

  it('از مرزِ ماه و سال درست رد می‌شود', () => {
    expect(adjacencyWindow('2026-01-01', '2026-12-31'))
      .toEqual({ lo: '2025-12-31', hi: '2027-01-01' });
    // اسفندِ کبیسهٔ میلادی
    expect(adjacencyWindow('2028-03-01', '2028-03-01'))
      .toEqual({ lo: '2028-02-29', hi: '2028-03-02' });
  });

  it('بدونِ همپوشانی، ردیفِ تازه', () => {
    const plan = planAbsence('2026-03-10', '2026-03-12', ' سفر ', []);
    expect(plan).toEqual({
      kind: 'insert', fromDate: '2026-03-10', toDate: '2026-03-12', note: 'سفر', deleteIds: [],
    });
  });

  it('بازهٔ همپوشان ادغام می‌شود و به اجتماعِ دو بازه گسترده', () => {
    const plan = planAbsence('2026-03-11', '2026-03-15', 'ادامه', [
      row({ id: 7, fromDate: '2026-03-08', toDate: '2026-03-12', note: 'بیماری' }),
    ]);
    expect(plan).toMatchObject({
      kind: 'merge', keepId: 7, fromDate: '2026-03-08', toDate: '2026-03-15', deleteIds: [],
    });
    expect(plan!.note).toBe('بیماری · ادامه');
  });

  it('چند ردیفِ همپوشان در اولی حل می‌شوند', () => {
    const plan = planAbsence('2026-03-09', '2026-03-20', '', [
      row({ id: 3, fromDate: '2026-03-08', toDate: '2026-03-10', note: 'الف' }),
      row({ id: 5, fromDate: '2026-03-14', toDate: '2026-03-22', note: 'ب' }),
    ]);
    expect(plan).toMatchObject({
      kind: 'merge', keepId: 3, fromDate: '2026-03-08', toDate: '2026-03-22', deleteIds: [5],
    });
    expect(plan!.note).toBe('الف · ب');
  });

  it('یادداشتِ تکراری دو بار نمی‌آید', () => {
    expect(joinNotes(['سفر', ' سفر ', '', 'بیماری'])).toBe('سفر · بیماری');
    expect(joinNotes(['', '  '])).toBe('');
  });

  it('ورودیِ بی‌تاریخ نقشه‌ای نمی‌سازد', () => {
    expect(planAbsence('', '2026-03-10', '', [])).toBeNull();
  });
});
