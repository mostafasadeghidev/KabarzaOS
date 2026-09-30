import { describe, it, expect } from 'vitest';
import {
  canTick, dayNumber, dueDateFor, itemsToAdd, progress, resolveAssignee, taskState, type LibraryItem,
} from './plan';

const item = (over: Partial<LibraryItem>): LibraryItem => ({
  id: 1, roleTagId: null, title: 't', description: '', kind: 'task', assignee: 'member',
  assigneeUserId: null, serviceId: null, link: '', dueDay: 1, sortOrder: 0, ...over,
});

describe('موعد', () => {
  it('روزِ ۱ همان روزِ شروع است', () => {
    expect(dueDateFor('2026-09-30', 1)).toBe('2026-09-30');
    expect(dueDateFor('2026-09-30', 3)).toBe('2026-10-02');
  });

  it('روزِ نامعتبر به بازهٔ مجاز برمی‌گردد', () => {
    expect(dueDateFor('2026-09-30', 0)).toBe('2026-09-30');
    expect(dueDateFor('2026-01-01', 500)).toBe(dueDateFor('2026-01-01', 90));
  });

  it('شمارهٔ روز', () => {
    expect(dayNumber('2026-09-30', '2026-10-01')).toBe(2);
  });
});

describe('کدام آیتم‌ها به این نفر می‌رسد', () => {
  const lib = [
    item({ id: 1, roleTagId: null, dueDay: 2 }),
    item({ id: 2, roleTagId: 10, dueDay: 1 }),
    item({ id: 3, roleTagId: 20, dueDay: 1 }),
  ];

  it('همهٔ نقش‌ها + نقشِ خودش، مرتب بر اساسِ موعد', () => {
    expect(itemsToAdd(lib, new Set([10]), new Set()).map((i) => i.id)).toEqual([2, 1]);
  });

  it('همگام‌سازی تکراری نمی‌سازد', () => {
    expect(itemsToAdd(lib, new Set([10]), new Set([2])).map((i) => i.id)).toEqual([1]);
  });
});

describe('انجام‌دهنده', () => {
  const ctx = { memberId: 5, officeManagerId: 7, serviceOwnerId: null, userId: 9 };
  it('هر قاعده به یک نفر', () => {
    expect(resolveAssignee('member', ctx)).toBe(5);
    expect(resolveAssignee('office_manager', ctx)).toBe(7);
    expect(resolveAssignee('user', ctx)).toBe(9);
  });
  it('سرویسِ بی‌مسئول → بی‌صاحب (مدیرانِ اعضا)', () => {
    expect(resolveAssignee('service_owner', ctx)).toBeNull();
  });
});

describe('وضعیت و پیشرفت', () => {
  const today = '2026-10-02';
  it('عقب‌افتاده فقط وقتی انجام نشده و موعد گذشته', () => {
    expect(taskState({ dueDate: '2026-10-01', doneAt: null }, today)).toBe('overdue');
    expect(taskState({ dueDate: '2026-10-02', doneAt: null }, today)).toBe('open');
    expect(taskState({ dueDate: '2026-10-01', doneAt: new Date() }, today)).toBe('done');
  });
  it('درصد', () => {
    const p = progress([
      { dueDate: '2026-10-01', doneAt: new Date() },
      { dueDate: '2026-10-01', doneAt: null },
      { dueDate: '2026-10-05', doneAt: null },
    ], today);
    expect(p).toEqual({ total: 3, done: 1, overdue: 1, percent: 33 });
  });
});

describe('چه کسی تیک می‌زند', () => {
  it('مدیرِ اعضا همیشه', () => {
    expect(canTick({ id: 1, canManageMembers: true }, { assigneeUserId: 9 })).toBe(true);
  });
  it('انجام‌دهندهٔ خودِ کار', () => {
    expect(canTick({ id: 9, canManageMembers: false }, { assigneeUserId: 9 })).toBe(true);
  });
  it('عضو کارِ دیگری یا کارِ بی‌صاحب را نه', () => {
    expect(canTick({ id: 5, canManageMembers: false }, { assigneeUserId: 9 })).toBe(false);
    expect(canTick({ id: 5, canManageMembers: false }, { assigneeUserId: null })).toBe(false);
  });
});
