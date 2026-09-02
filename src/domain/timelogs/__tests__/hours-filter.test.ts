import { describe, expect, it } from 'vitest';
import { clampPage, hasHoursFilter, hoursQuery, parseHoursFilter } from '../hours-filter';

describe('فیلترِ صفحهٔ ساعت — پورتِ view_hours', () => {
  it('پارامترها: تاریخِ نامعتبر خالی، صفحهٔ نامعتبر ۱، نامِ پروژه بریده', () => {
    expect(parseHoursFilter({ from: '2026-09-01', to: 'bad', project: '  وب  ', page: '3' }))
      .toEqual({ from: '2026-09-01', to: '', project: 'وب', page: 3 });
    expect(parseHoursFilter({ page: '0' }).page).toBe(1);
    expect(parseHoursFilter({}).from).toBe('');
  });

  it('جمعِ بازه فقط با فیلتر', () => {
    expect(hasHoursFilter({ from: '', to: '', project: '' })).toBe(false);
    expect(hasHoursFilter({ from: '', to: '', project: 'x' })).toBe(true);
  });

  it('پرس‌وجو فیلترها را نگه می‌دارد؛ صفحهٔ ۱ نمی‌رود', () => {
    expect(hoursQuery({ from: '2026-09-01', to: '', project: 'وب' }, 2)).toBe('from=2026-09-01&project=%D9%88%D8%A8&page=2');
    expect(hoursQuery({ from: '', to: '', project: '' }, 1)).toBe('');
  });

  it('صفحهٔ بیرون از بازه به آخرین می‌چسبد', () => {
    expect(clampPage(9, 31)).toEqual({ page: 3, pages: 3 });
    expect(clampPage(1, 0)).toEqual({ page: 1, pages: 1 });
  });
});
