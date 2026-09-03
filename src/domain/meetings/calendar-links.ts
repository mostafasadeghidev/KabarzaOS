/**
 * پیوندِ «افزودن به تقویم» برای سرویس‌های بیرونی.
 *
 * ⚠️ فایلِ ICS همیشه هست و کارِ همه را راه می‌اندازد، ولی روی وب باز کردنِ
 * تقویمِ آنلاین یک کلیک است و ICS سه کلیک (دانلود، بازکردن، تأیید). پس هر دو
 * راه پیشنهاد می‌شود: سرویس‌های پرکاربرد + دانلودِ فایل به‌عنوانِ راهِ همگانی.
 *
 * ⚠️ همهٔ زمان‌ها **UTC** فرستاده می‌شوند (قالبِ `YYYYMMDDTHHMMSSZ`): هر
 * تقویمی خودش به وقتِ کاربر نشان می‌دهد و هیچ حدسی دربارهٔ منطقهٔ زمانی لازم
 * نیست.
 */

export interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  start: Date;
  /** پایانِ جلسه؛ نبودنش یعنی یک ساعت پس از شروع. */
  end?: Date;
}

export const DEFAULT_MINUTES = 60;

/** `2026-09-03T10:30:00Z` → `20260903T103000Z`. */
export function utcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

function endOf(event: CalendarEvent): Date {
  return event.end ?? new Date(event.start.getTime() + DEFAULT_MINUTES * 60_000);
}

/** Google Calendar — پارامترِ `dates` با «/» بینِ شروع و پایان. */
export function googleUrl(event: CalendarEvent): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${utcStamp(event.start)}/${utcStamp(endOf(event))}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Outlook — وب‌اپِ شخصی (outlook.com) و سازمانی (office.com) یک قالب دارند. */
function outlook(host: string, event: CalendarEvent): string {
  const q = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: event.start.toISOString(),
    enddt: endOf(event).toISOString(),
    body: event.description,
    location: event.location,
  });
  return `https://${host}/calendar/0/deeplink/compose?${q.toString()}`;
}

export function outlookLiveUrl(event: CalendarEvent): string {
  return outlook('outlook.live.com', event);
}

export function outlookOfficeUrl(event: CalendarEvent): string {
  return outlook('outlook.office.com', event);
}

/** Yahoo — مدتِ جلسه را به‌صورتِ `hhmm` می‌خواهد، نه زمانِ پایان. */
export function yahooUrl(event: CalendarEvent): string {
  const minutes = Math.max(1, Math.round((endOf(event).getTime() - event.start.getTime()) / 60_000));
  const duration = `${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}`;
  const q = new URLSearchParams({
    v: '60',
    title: event.title,
    st: utcStamp(event.start),
    dur: duration,
    desc: event.description,
    in_loc: event.location,
  });
  return `https://calendar.yahoo.com/?${q.toString()}`;
}

export interface CalendarTarget {
  key: 'google' | 'outlook' | 'office' | 'yahoo' | 'ics';
  label: string;
  href: (event: CalendarEvent, icsHref: string) => string;
  /** فایل دانلود می‌شود، نه اینکه در تبِ تازه باز شود. */
  download?: boolean;
}

/**
 * ترتیبِ نمایش: پرکاربردترین‌ها اول، و «فایلِ تقویم» آخر — همان گزینه‌ای که
 * روی موبایل تقویمِ خودِ دستگاه را باز می‌کند و برای Apple Calendar، تقویمِ
 * اندروید و هر برنامهٔ دسکتاپی کار می‌کند.
 */
export const CALENDAR_TARGETS: CalendarTarget[] = [
  { key: 'google', label: 'گوگل کلندر', href: (e) => googleUrl(e) },
  { key: 'outlook', label: 'اوت‌لوک (شخصی)', href: (e) => outlookLiveUrl(e) },
  { key: 'office', label: 'اوت‌لوک (سازمانی)', href: (e) => outlookOfficeUrl(e) },
  { key: 'yahoo', label: 'یاهو', href: (e) => yahooUrl(e) },
  { key: 'ics', label: 'فایلِ تقویم (اپل، موبایل و بقیه)', href: (_e, ics) => ics, download: true },
];
