import { describe, expect, it } from 'vitest';
import { buildIcs, escapeIcs, icsFilename } from './ics';

const base = {
  id: 7,
  title: 'جلسهٔ هفتگی',
  description: 'بررسیِ پیشرفت',
  location: 'اتاقِ ۲',
  meetAt: new Date(2026, 8, 15, 10, 30, 0),
};

describe('خروجیِ ICS', () => {
  it('⚠️ گریزِ RFC 5545 — بک‌اسلش اول', () => {
    expect(escapeIcs('a,b')).toBe('a\\,b');
    expect(escapeIcs('a;b')).toBe('a\\;b');
    // بک‌اسلشِ خام دوتا می‌شود و کامای بعدش هم گریز می‌خورد — نه سه‌تا.
    expect(escapeIcs('a\\b,c')).toBe('a\\\\b\\,c');
    expect(escapeIcs('خط\nدوم')).toBe('خط\\nدوم');
  });

  it('⚠️ زمان بدونِ Z نوشته می‌شود — زمانِ دیواریِ شناور', () => {
    const out = buildIcs(base, 'kabarza.test', new Date(Date.UTC(2026, 7, 29, 8, 0, 0)));
    expect(out).toContain('DTSTART:20260915T103000');
    expect(out).not.toContain('DTSTART:20260915T103000Z');
    // ولی DTSTAMP طبقِ استاندارد UTC است.
    expect(out).toContain('DTSTAMP:20260829T080000Z');
  });

  it('پایانِ جلسه یک ساعت بعد است', () => {
    const out = buildIcs(base, 'h', new Date());
    expect(out).toContain('DTEND:20260915T113000');
  });

  it('نامِ پروژه به مکان می‌چسبد', () => {
    const out = buildIcs({ ...base, projectTitle: 'وب‌سایتِ آلفا' }, 'h', new Date());
    expect(out).toContain('LOCATION:اتاقِ ۲ — وب‌سایتِ آلفا');
  });

  it('مکانِ خالی جداکنندهٔ یتیم نمی‌گذارد', () => {
    const out = buildIcs({ ...base, location: '', projectTitle: 'آلفا' }, 'h', new Date());
    expect(out).toContain('LOCATION:آلفا');
    const empty = buildIcs({ ...base, location: '', projectTitle: null }, 'h', new Date());
    expect(empty).toContain('LOCATION:\r\n');
  });

  it('⚠️ خطوط با CRLF جدا می‌شوند', () => {
    const out = buildIcs(base, 'h', new Date());
    expect(out.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(out.endsWith('END:VCALENDAR')).toBe(true);
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it('شناسهٔ یکتا میزبان را در خود دارد', () => {
    expect(buildIcs(base, 'kabarza.test', new Date()))
      .toContain('UID:kabarza-meeting-7@kabarza.test');
    expect(icsFilename(7)).toBe('meeting-7.ics');
  });
});
