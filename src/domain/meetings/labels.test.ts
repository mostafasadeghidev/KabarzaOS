import { describe, expect, it } from 'vitest';
import { attendeeLabel, classifyAttendee } from './labels';

const people = {
  dev: { userId: 2, name: 'سارا', sub: 'دولوپر', type: 'member' as const },
  client: { userId: 3, name: 'شرکتِ الف', sub: 'کارفرما', type: 'client' as const },
  admin: { userId: 9, name: 'مالک', sub: 'مدیر کل', type: 'admin' as const },
};

describe('R-MEET-08 — ماسکِ نام در فهرستِ دعوت‌شدگان', () => {
  it('مالک همه را با نام می‌بیند', () => {
    const v = { isOwner: true, isClient: false };
    expect(attendeeLabel(people.dev, v)).toBe('سارا (دولوپر)');
    expect(attendeeLabel(people.client, v)).toBe('شرکتِ الف (کارفرما)');
  });

  it('⚠️ کارفرما نامِ عضو را نمی‌بیند — فقط نقشش', () => {
    const v = { isOwner: false, isClient: true };
    expect(attendeeLabel(people.dev, v)).toBe('دولوپر');
    // نامِ خودش/دیگر کارفرماها و مدیر کل پنهان نیست.
    expect(attendeeLabel(people.client, v)).toBe('شرکتِ الف (کارفرما)');
    expect(attendeeLabel(people.admin, v)).toBe('مالک (مدیر کل)');
  });

  it('⚠️ عضوِ تیم نامِ کارفرما را نمی‌بیند — فقط «کارفرما»', () => {
    const v = { isOwner: false, isClient: false };
    expect(attendeeLabel(people.client, v)).toBe('کارفرما');
    expect(attendeeLabel(people.dev, v)).toBe('سارا (دولوپر)');
  });

  it('زیرنویس ترجمه می‌شود', () => {
    const t = (k: string) => (k === 'کارفرما' ? 'Client' : k);
    expect(attendeeLabel(people.client, { isOwner: false, isClient: false }, t as never)).toBe('Client');
  });
});

describe('classifyAttendee — نقشِ پروژه پیش از کارفرما پیش از مدیر', () => {
  const ctx = {
    roleByUser: new Map<number, string | null>([[2, 'دولوپر'], [4, null]]),
    clientIds: new Set([3, 2]),
    adminIds: new Set([9]),
  };

  it('عضوی که هم کارفرماست با نقشِ عضوش دیده می‌شود', () => {
    expect(classifyAttendee(2, ctx)).toEqual({ sub: 'دولوپر', type: 'member' });
  });

  it('عضوِ بدونِ نقش «عضو» است', () => {
    expect(classifyAttendee(4, ctx)).toEqual({ sub: 'عضو', type: 'member' });
  });

  it('کارفرما، مدیر کل، و غریبه', () => {
    expect(classifyAttendee(3, ctx)).toEqual({ sub: 'کارفرما', type: 'client' });
    expect(classifyAttendee(9, ctx)).toEqual({ sub: 'مدیر کل', type: 'admin' });
    expect(classifyAttendee(77, ctx)).toEqual({ sub: 'عضو', type: 'member' });
  });
});
