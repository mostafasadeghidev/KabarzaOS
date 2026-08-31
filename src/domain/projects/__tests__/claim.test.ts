import { describe, expect, it } from 'vitest';
import {
  BOARD_COLUMNS, boardColumn, canClaimTask, claimableRoleId,
  groupIntoColumns, paginate,
} from '../claim';

const holders = (map: Record<number, number[]>) =>
  new Map(Object.entries(map).map(([k, v]) => [Number(k), v]));

describe('برداشتنِ تسک', () => {
  const base = {
    assignedTo: null,
    roles: [{ roleTagId: 5, claimedBy: null }],
    roleHolders: holders({ 5: [1, 2] }),
    userId: 1,
  };

  it('نقشِ آزاد با چند دارنده قابلِ برداشتن است', () => {
    expect(canClaimTask(base)).toBe(true);
    expect(claimableRoleId(base)).toBe(5);
  });

  it('⚠️ تنها دارندهٔ نقش «برنمی‌دارد» — تسک از پیش مالِ اوست', () => {
    // دکمه‌ای که هیچ چیزی را عوض نمی‌کند فقط سردرگم‌کننده است.
    expect(canClaimTask({ ...base, roleHolders: holders({ 5: [1] }) })).toBe(false);
  });

  it('تسکِ دارای مسئول برداشته نمی‌شود', () => {
    expect(canClaimTask({ ...base, assignedTo: 9 })).toBe(false);
  });

  it('نقشِ برداشته‌شده دوباره برداشته نمی‌شود', () => {
    expect(canClaimTask({ ...base, roles: [{ roleTagId: 5, claimedBy: 2 }] })).toBe(false);
  });

  it('کسی که نقش را ندارد نمی‌تواند', () => {
    expect(canClaimTask({ ...base, userId: 99 })).toBe(false);
  });

  it('تسکِ بی‌نقش برداشته نمی‌شود', () => {
    expect(canClaimTask({ ...base, roles: [] })).toBe(false);
  });

  it('از میانِ چند نقش، اولین نقشِ واجدِ شرایط انتخاب می‌شود', () => {
    const input = {
      ...base,
      roles: [
        { roleTagId: 4, claimedBy: 7 },   // برداشته‌شده
        { roleTagId: 5, claimedBy: null },
      ],
      roleHolders: holders({ 4: [1, 3], 5: [1, 2] }),
    };
    expect(claimableRoleId(input)).toBe(5);
  });

  it('وقتی نمی‌شود برداشت، نقشی هم برنمی‌گردد', () => {
    expect(claimableRoleId({ ...base, assignedTo: 9 })).toBeNull();
  });
});

describe('ستون‌های کانبان', () => {
  it('چهار ستون به ترتیبِ جریانِ کار', () => {
    expect(BOARD_COLUMNS.map((c) => c.group))
      .toEqual(['not_started', 'in_progress', 'review', 'complete']);
  });

  it('نیازمندِ بررسی بر گروهِ وضعیت مقدم است', () => {
    expect(boardColumn('in_progress', true)).toBe('review');
  });

  it('⚠️ وضعیتِ ناشناخته یا خالی در «شروع نشده» می‌افتد، نه اینکه ناپدید شود', () => {
    // تسکِ نامرئی همان تسکِ فراموش‌شده است.
    expect(boardColumn(null, false)).toBe('not_started');
    expect(boardColumn('چیزِ عجیب', false)).toBe('not_started');
  });

  it('هیچ تسکی از برد نمی‌افتد', () => {
    const tasks = [
      { id: 1, statusGroup: 'in_progress', isReview: false },
      { id: 2, statusGroup: null, isReview: false },
      { id: 3, statusGroup: 'complete', isReview: false },
      { id: 4, statusGroup: 'in_progress', isReview: true },
    ];
    const columns = groupIntoColumns(tasks);
    const placed = [...columns.values()].flat().length;
    expect(placed).toBe(tasks.length);
    expect(columns.get('review')!.map((t) => t.id)).toEqual([4]);
    expect(columns.get('not_started')!.map((t) => t.id)).toEqual([2]);
  });

  it('همهٔ ستون‌ها حتی خالی هم هستند', () => {
    const columns = groupIntoColumns([]);
    expect(columns.size).toBe(4);
  });
});

describe('صفحه‌بندی', () => {
  const items = Array.from({ length: 60 }, (_, i) => i + 1);

  it('برش و شمارشِ درست', () => {
    const page = paginate(items, 2, 25);
    expect(page.items[0]).toBe(26);
    expect(page.items).toHaveLength(25);
    expect(page.pages).toBe(3);
    expect(page.total).toBe(60);
  });

  it('⚠️ صفحهٔ بیرون از بازه به نزدیک‌ترین صفحهٔ معتبر بسته می‌شود', () => {
    expect(paginate(items, 99, 25).page).toBe(3);
    expect(paginate(items, 0, 25).page).toBe(1);
    expect(paginate(items, -5, 25).page).toBe(1);
  });

  it('فهرستِ خالی یک صفحه دارد، نه صفر', () => {
    const page = paginate([], 1, 25);
    expect(page.pages).toBe(1);
    expect(page.items).toEqual([]);
  });
});
