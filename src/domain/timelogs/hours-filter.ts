import { parseDate } from '../reports/filters';

/**
 * فیلترهای صفحهٔ «ساعت کاری» — پورتِ `view_hours()` ِ افزونه: بازهٔ تاریخ
 * (پیش‌فرض خالی = همهٔ زمان)، نامِ پروژه (شامل)، صفحه‌بندیِ ۱۵تایی با حفظِ فیلتر.
 */

export const HOURS_PER_PAGE = 15;

export interface HoursFilter {
  from: string;
  to: string;
  project: string;
  page: number;
}

export function parseHoursFilter(query: { from?: unknown; to?: unknown; project?: unknown; page?: unknown }): HoursFilter {
  const page = Number(query.page);
  return {
    from: parseDate(query.from) ?? '',
    to: parseDate(query.to) ?? '',
    project: typeof query.project === 'string' ? query.project.trim().slice(0, 100) : '',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** پورتِ `$has_filter`: جمعِ بازه فقط وقتی فیلتری فعال است نشان داده می‌شود. */
export function hasHoursFilter(f: Pick<HoursFilter, 'from' | 'to' | 'project'>): boolean {
  return f.from !== '' || f.to !== '' || f.project !== '';
}

/** رشتهٔ پرس‌وجو با حفظِ فیلترها (پورتِ pager ِ افزونه). */
export function hoursQuery(f: Pick<HoursFilter, 'from' | 'to' | 'project'>, page?: number): string {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.project) p.set('project', f.project);
  if (page && page > 1) p.set('page', String(page));
  return p.toString();
}

/** صفحهٔ درخواستی در بازهٔ مجاز — بیرون از بازه به آخرین صفحه می‌چسبد. */
export function clampPage(page: number, total: number, perPage = HOURS_PER_PAGE): { page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return { page: Math.min(Math.max(1, page), pages), pages };
}
