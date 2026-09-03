import { describe, it, expect } from 'vitest';
import {
  CALENDAR_TARGETS, googleUrl, outlookLiveUrl, utcStamp, yahooUrl,
} from '../calendar-links';
import { meetingCandidates } from '../attendees';

const event = {
  title: 'بازبینیِ پروژه',
  description: 'پیشرفتِ هفته',
  location: 'دفترِ مرکزی',
  start: new Date('2026-09-10T08:30:00Z'),
  end: new Date('2026-09-10T09:45:00Z'),
};

describe('پیوندهای تقویم', () => {
  it('گوگل بازهٔ UTC را با «/» می‌گیرد', () => {
    const url = new URL(googleUrl(event));
    expect(url.searchParams.get('dates')).toBe('20260910T083000Z/20260910T094500Z');
    expect(url.searchParams.get('text')).toBe('بازبینیِ پروژه');
    expect(url.searchParams.get('location')).toBe('دفترِ مرکزی');
  });

  it('اوت‌لوک زمانِ ISO می‌گیرد', () => {
    const url = new URL(outlookLiveUrl(event));
    expect(url.searchParams.get('startdt')).toBe('2026-09-10T08:30:00.000Z');
    expect(url.searchParams.get('subject')).toBe('بازبینیِ پروژه');
  });

  it('یاهو مدت را به‌صورتِ hhmm می‌خواهد', () => {
    expect(new URL(yahooUrl(event)).searchParams.get('dur')).toBe('0115');
  });

  it('بدونِ زمانِ پایان، یک ساعت در نظر گرفته می‌شود', () => {
    const open = { ...event, end: undefined };
    expect(new URL(googleUrl(open)).searchParams.get('dates'))
      .toBe('20260910T083000Z/20260910T093000Z');
    expect(new URL(yahooUrl(open)).searchParams.get('dur')).toBe('0100');
  });

  it('utcStamp قالبِ فشردهٔ تقویم را می‌دهد', () => {
    expect(utcStamp(new Date('2026-01-02T03:04:05Z'))).toBe('20260102T030405Z');
  });

  it('فایلِ تقویم گزینهٔ آخر و دانلودی است', () => {
    const ics = CALENDAR_TARGETS.at(-1)!;
    expect(ics.key).toBe('ics');
    expect(ics.download).toBe(true);
    expect(ics.href(event, '/api/meetings/7/ics')).toBe('/api/meetings/7/ics');
  });
});

describe('تیکِ پیش‌فرضِ سازندهٔ جلسه', () => {
  const sources = {
    projectMembers: [{ userId: 2, name: 'سارا', roleName: 'طراح' }],
    admins: [{ userId: 1, name: 'مالک' }, { userId: 9, name: 'ادمین' }],
  };

  it('مدیرِ کلی که جلسه را می‌سازد، خودش تیک می‌خورد', () => {
    const list = meetingCandidates('project', { ...sources, currentUserId: 1 });
    expect(list.find((c) => c.userId === 1)!.checked).toBe(true);
    // بقیهٔ مدیران همچنان تیک‌نخورده‌اند.
    expect(list.find((c) => c.userId === 9)!.checked).toBe(false);
  });

  it('اگر سازنده مدیرِ پروژه باشد، مالک تیک نمی‌خورد', () => {
    const list = meetingCandidates('project', { ...sources, currentUserId: 2 });
    expect(list.find((c) => c.userId === 1)!.checked).toBe(false);
    expect(list.find((c) => c.userId === 2)!.checked).toBe(true);
  });

  it('بدونِ سازنده، همان قاعدهٔ قبلی می‌ماند', () => {
    const list = meetingCandidates('project', sources);
    expect(list.find((c) => c.userId === 1)!.checked).toBe(false);
  });
});
