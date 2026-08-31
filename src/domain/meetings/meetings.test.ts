import { describe, it, expect } from 'vitest';
import { defaultAttendees, meetingCandidates } from './attendees';
import { fireTimes, leadLabel, normalizeLeads, statusLabel } from './reminders';

const sources = {
  projectMembers: [
    { userId: 1, name: 'آلیس', roleName: 'دولوپر' },
    { userId: 2, name: 'باب', roleName: null },
    { userId: 9, name: 'عضوِ سابق', roleName: 'طراح' },
  ],
  projectClients: [
    { userId: 3, name: 'شرکتِ آلفا' },
    { userId: 1, name: 'آلیس' }, // هم عضو، هم کارفرما
  ],
  officeMembers: [{ userId: 4, name: 'کارن' }],
  admins: [{ userId: 5, name: 'مالک' }, { userId: 1, name: 'آلیس' }],
};

describe('دعوت‌شدگانِ جلسه', () => {
  it('جلسهٔ پروژه‌ای: اعضا با نقششان، کارفرما با برچسبِ خودش', () => {
    const list = meetingCandidates('project', sources);
    expect(list.find((c) => c.userId === 1)!.sub).toBe('دولوپر');
    expect(list.find((c) => c.userId === 2)!.sub).toBe('عضو');
    expect(list.find((c) => c.userId === 3)!.sub).toBe('کارفرما');
  });

  it('جلسهٔ عمومی از اعضای دفتر پر می‌شود، نه از پروژه', () => {
    const list = meetingCandidates('general', sources);
    // ۴ عضوِ دفتر · ۵ و ۱ مدیر (آلیس اینجا عضوِ دفتر نیست، پس به‌عنوانِ مدیر می‌آید).
    expect(list.map((c) => c.userId)).toEqual([4, 5, 1]);
    expect(list.find((c) => c.userId === 1)!.sub).toBe('مدیر کل');
  });

  it('⚠️ عضوِ off-board شده اصلاً پیشنهاد نمی‌شود', () => {
    const list = meetingCandidates('project', { ...sources, inactiveUserIds: new Set([9]) });
    expect(list.map((c) => c.userId)).not.toContain(9);
  });

  it('⚠️ مدیران در فهرست هستند ولی پیش‌فرض تیک نمی‌خورند', () => {
    // دعوتشان اختیاری است، نه خودکار.
    const list = meetingCandidates('project', sources);
    expect(list.find((c) => c.userId === 5)).toEqual({
      userId: 5, name: 'مالک', sub: 'مدیر کل', checked: false,
    });
  });

  it('⚠️ هر نفر یک بار و با اولین برچسبش — نقشِ عضو بر کارفرما و مدیر مقدم است', () => {
    const list = meetingCandidates('project', sources);
    expect(list.filter((c) => c.userId === 1)).toHaveLength(1);
    expect(list.find((c) => c.userId === 1)!.sub).toBe('دولوپر');
  });

  it('تیک‌های پیش‌فرض همه‌اند جز مدیران', () => {
    const list = meetingCandidates('project', sources);
    expect(defaultAttendees(list).sort()).toEqual([1, 2, 3, 9]);
  });
});

describe('پیش‌آگاهیِ یادآور', () => {
  it('مقادیرِ ناشناخته دور ریخته می‌شوند', () => {
    expect(normalizeLeads([0, 7, 60, 99999])).toEqual([0, 60]);
  });

  it('تکراری‌ها ادغام و مرتب می‌شوند', () => {
    expect(normalizeLeads([1440, 0, 60, 60])).toEqual([0, 60, 1440]);
  });

  it('⚠️ فهرستِ خالی به «سرِ موقع» می‌افتد', () => {
    // یادآوری که هیچ‌وقت شلیک نکند بی‌معناست.
    expect(normalizeLeads([])).toEqual([0]);
    expect(normalizeLeads([5, 7])).toEqual([0]);
  });

  it('برچسبِ هر گزینه', () => {
    expect(leadLabel(0)).toBe('سرِ موقع');
    expect(leadLabel(1440)).toBe('۱ روز قبل');
  });

  it('زمانِ شلیک از هدف عقب می‌رود', () => {
    const target = new Date('2026-09-01T10:00:00Z');
    const now = new Date('2026-08-01T00:00:00Z');
    const times = fireTimes(target, [0, 60], now).map((d) => d.toISOString());
    expect(times).toEqual(['2026-09-01T09:00:00.000Z', '2026-09-01T10:00:00.000Z']);
  });

  it('⚠️ پیش‌آگاهیِ گذشته شلیک نمی‌شود', () => {
    // «۲۰ دقیقه دیگر» با گزینهٔ «۱ روز قبل» نباید فوراً اعلان بدهد.
    const target = new Date('2026-08-01T00:20:00Z');
    const now = new Date('2026-08-01T00:00:00Z');
    const times = fireTimes(target, [0, 1440], now);
    expect(times).toHaveLength(1);
    expect(times[0]!.toISOString()).toBe('2026-08-01T00:20:00.000Z');
  });

  it('برچسبِ وضعیت', () => {
    expect(statusLabel('pending')).toBe('در انتظار');
    expect(statusLabel('sending')).toBe('در حال ارسال…');
    expect(statusLabel('sent')).toBe('ارسال‌شده');
  });
});
