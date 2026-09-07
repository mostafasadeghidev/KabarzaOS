import { describe, expect, it } from 'vitest';
import { buildThreads, countOpenThreads } from '../threads';

const rows = [
  { id: 1, parentId: null, status: 'needs_review' },
  { id: 2, parentId: 1, status: 'needs_review' },
  { id: 3, parentId: 2, status: 'done' },      // تازه‌ترین پیامِ رشتهٔ ۱ → بسته
  { id: 4, parentId: null, status: 'done' },
  { id: 5, parentId: 4, status: 'needs_review' }, // پاسخِ تازه رشتهٔ بسته را باز می‌کند
  { id: 6, parentId: null, status: 'needs_review' },
];

describe('رشته‌های کامنت — پورتِ render_thread', () => {
  it('⚠️ وضعیتِ رشته از تازه‌ترین پیام است، نه ریشه؛ ریشه‌ها تازه‌تر اول، پاسخ‌ها کهنه‌تر اول', () => {
    const { open, closed } = buildThreads(rows, 'comment');
    expect(open.map((t) => [t.root.id, t.latest.id])).toEqual([[6, 6], [4, 5]]);
    expect(closed.map((t) => [t.root.id, t.latest.id])).toEqual([[1, 3]]);
    expect(closed[0]!.replies.map((r) => [r.node.id, r.depth])).toEqual([[2, 1], [3, 2]]);
  });

  it('⚠️ «resolved» ِ قدیمی بسته نیست — مهاجرتِ 0026 آن را به done برده', () => {
    // اگر ردیفی جا مانده باشد، باز شمرده می‌شود و دیده می‌ماند؛ بی‌صدا گم نمی‌شود.
    const legacy = [
      { id: 1, parentId: null, status: 'resolved' },
      { id: 2, parentId: null, status: 'done' },
    ];
    const { open, closed } = buildThreads(legacy);
    expect(closed.map((t) => t.root.id)).toEqual([2]);
    expect(open.map((t) => t.root.id)).toEqual([1]);
  });

  it('شمارندهٔ «نیازمند بررسی» رشته می‌شمارد، نه ردیف', () => {
    expect(countOpenThreads(rows)).toBe(2);
    expect(countOpenThreads([])).toBe(0);
  });

  it('پاسخِ یتیم (والدِ حذف‌شده) خودش ریشه می‌شود', () => {
    const { open } = buildThreads([{ id: 9, parentId: 99, status: 'needs_review' }], 'comment');
    expect(open.map((t) => t.root.id)).toEqual([9]);
  });
});
