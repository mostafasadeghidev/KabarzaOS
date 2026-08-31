/**
 * خروجیِ تقویم (ICS) برای یک جلسه — پورتِ `handle_meeting_ics()`.
 *
 * ⚠️ زمان **بدونِ منطقهٔ زمانی** نوشته می‌شود (زمانِ دیواریِ شناور). عمدی است:
 * جلسه با ساعتِ محلی ثبت شده و اگر اینجا به UTC تبدیلش کنیم، تقویمِ کاربر
 * دوباره به وقتِ محلیِ **خودش** برمی‌گرداند و ساعت جابه‌جا می‌شود.
 *
 * ⚠️ جلسه پایان ندارد؛ نسخهٔ قبلی یک ساعت فرض می‌کند و ما هم همان.
 */

/** یک ساعت — همان پیش‌فرضِ نسخهٔ قبلی. */
const DEFAULT_MINUTES = 60;

/**
 * گریزِ RFC 5545: کاما، نقطه‌ویرگول و بک‌اسلش باید گریز بخورند و خطِ تازه
 * به `\n` تبدیل شود.
 * ⚠️ ترتیب مهم است — بک‌اسلش **اول**، وگرنه گریزهای بعدی دوباره گریز می‌خورند.
 */
export function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

/** مهرِ زمانِ محلی به شکلِ `YYYYMMDDTHHMMSS` — بدونِ `Z`. */
function localStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`
    + `T${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** مهرِ UTC — فقط برای `DTSTAMP` که طبقِ استاندارد باید UTC باشد. */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface IcsMeeting {
  id: number;
  title: string;
  description: string;
  location: string;
  meetAt: Date;
  /** نامِ پروژه، اگر جلسه به پروژه‌ای بسته باشد. */
  projectTitle?: string | null;
}

/**
 * متنِ کاملِ فایلِ ICS.
 * ⚠️ خطوط با CRLF جدا می‌شوند، نه LF — بعضی تقویم‌ها فایلِ LF را رد می‌کنند.
 */
export function buildIcs(meeting: IcsMeeting, host: string, now: Date): string {
  const start = meeting.meetAt;
  const end = new Date(start.getTime() + DEFAULT_MINUTES * 60_000);

  // نامِ پروژه به مکان می‌چسبد — همان کاری که نسخهٔ قبلی می‌کند.
  const location = [meeting.location, meeting.projectTitle]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(' — ');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KabarzaOS//Meetings//FA',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:kabarza-meeting-${meeting.id}@${host}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${localStamp(start)}`,
    `DTEND:${localStamp(end)}`,
    `SUMMARY:${escapeIcs(meeting.title)}`,
    `DESCRIPTION:${escapeIcs(meeting.description)}`,
    `LOCATION:${escapeIcs(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** نامِ فایلِ پیشنهادی. */
export function icsFilename(meetingId: number): string {
  return `meeting-${meetingId}.ics`;
}
