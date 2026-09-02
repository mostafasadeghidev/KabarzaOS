import { describe, expect, it } from 'vitest';
import { counterpartLabel, groupInbox, personLabel, readUpTo } from './labels';

const names = new Map([[1, 'مالک'], [2, 'ادمین'], [3, 'سارا'], [4, 'کارفرما']]);
const managerIds = new Set([1, 2]);

describe('R-MSG-03 — هویتِ مدیریت برای اعضا ماسک می‌شود', () => {
  it('⚠️ گفتگو با دو مدیر → عضو فقط «مدیریت» می‌بیند، نه «مدیریت و ۱ نفر دیگر»', () => {
    const ctx = { viewerId: 3, viewerIsManager: false, managerIds, names };
    expect(counterpartLabel([1, 2, 3], ctx)).toBe('مدیریت');
    expect(personLabel(1, ctx)).toBe('مدیریت');
  });

  it('مدیر نامِ واقعیِ همه را می‌بیند', () => {
    const ctx = { viewerId: 1, viewerIsManager: true, managerIds, names };
    expect(counterpartLabel([1, 3], ctx)).toBe('سارا');
    expect(personLabel(2, ctx)).toBe('ادمین');
  });

  it('«و N نفر دیگر» برای چند طرفِ غیرمدیر', () => {
    const ctx = { viewerId: 1, viewerIsManager: true, managerIds, names };
    expect(counterpartLabel([1, 3, 4], ctx)).toBe('سارا و 1 نفر دیگر');
    // عضو در گفتگویی با مدیر و یک عضوِ دیگر: «مدیریت» + یک نفر.
    const member = { viewerId: 3, viewerIsManager: false, managerIds, names };
    expect(counterpartLabel([1, 2, 3, 4], member)).toBe('مدیریت و 1 نفر دیگر');
  });

  it('نامِ ناشناخته با شناسه چاپ می‌شود و خودِ بیننده کنار می‌رود', () => {
    const ctx = { viewerId: 3, viewerIsManager: false, managerIds, names };
    expect(counterpartLabel([3, 77], ctx)).toBe('#77');
    expect(counterpartLabel([3], ctx)).toBe('');
  });

  it('برچسب ترجمه می‌شود', () => {
    const t = (k: string, p?: Record<string, unknown>) =>
      (k === 'مدیریت' ? 'Management' : k === 'و {n} نفر دیگر' ? `and ${p?.n} more` : k);
    const ctx = { viewerId: 3, viewerIsManager: false, managerIds, names };
    expect(counterpartLabel([1, 3, 4], ctx, t as never)).toBe('Management and 1 more');
  });
});

describe('R-MSG-07 — رسیدِ خواندن', () => {
  it('پیامِ من خوانده‌شده است وقتی **همهٔ** طرف‌های دیگر به آن رسیده باشند', () => {
    const states = [
      { userId: 1, lastReadMessageId: 9 },
      { userId: 3, lastReadMessageId: 5 },
      { userId: 4, lastReadMessageId: null },
    ];
    expect(readUpTo(states, 1)).toBe(0); // یکی هنوز هیچ نخوانده.
    expect(readUpTo(states.slice(0, 2), 1)).toBe(5);
    expect(readUpTo([{ userId: 1, lastReadMessageId: 9 }], 1)).toBe(0);
  });
});

describe('R-MSG-01 — آکاردئونِ ارسالِ همگانی در صندوقِ فرستنده', () => {
  const row = (id: number, over = {}) => ({ id, broadcastId: null, isMine: true, unread: 0, ...over });

  it('گفتگوهای یک broadcast گروه می‌شوند و خوانده‌نشده‌ها جمع', () => {
    const entries = groupInbox([
      row(5, { broadcastId: 5, unread: 1 }),
      row(4),
      row(6, { broadcastId: 5, unread: 2 }),
    ]);
    expect(entries.map((e) => e.kind)).toEqual(['group', 'single']);
    const group = entries[0] as Extract<typeof entries[number], { kind: 'group' }>;
    expect(group.threads.map((t) => t.id)).toEqual([5, 6]);
    expect(group.unread).toBe(3);
  });

  it('⚠️ گیرنده هرگز گروه نمی‌بیند — فقط فرستنده', () => {
    const entries = groupInbox([
      row(5, { broadcastId: 5, isMine: false }),
      row(6, { broadcastId: 5, isMine: false }),
    ]);
    expect(entries.every((e) => e.kind === 'single')).toBe(true);
  });

  it('گروهِ یک‌نفره گروه نیست', () => {
    expect(groupInbox([row(5, { broadcastId: 5 })])[0]!.kind).toBe('single');
  });
});
