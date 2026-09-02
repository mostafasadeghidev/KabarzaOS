import { describe, expect, it } from 'vitest';
import {
  daysUntil, deadlineBadge, excerptWords, focusHref, groupByProject, isFocusView, openThreads,
} from '../focus';

const t = (k: string, p?: Record<string, string | number>) => (p ? `${k}|${p.n}` : k);

describe('فهرستِ متمرکزِ داشبورد — پورتِ Focus_Page', () => {
  it('نمای معتبر', () => {
    expect(isFocusView('tasks_review')).toBe(true);
    expect(isFocusView('everything')).toBe(false);
    expect(isFocusView(undefined)).toBe(false);
  });

  it('نشانِ ددلاین: امروز / n روز مانده', () => {
    expect(daysUntil('2026-09-03', '2026-09-03')).toBe(0);
    expect(daysUntil('2026-09-03', '2026-09-10')).toBe(7);
    expect(deadlineBadge(0, t)).toBe('امروز');
    expect(deadlineBadge(3, t)).toBe('{n} روز مانده|3');
  });

  it('گزیدهٔ ۱۲ کلمه‌ای بی‌تگ', () => {
    expect(excerptWords('<p>یک دو</p>  سه')).toBe('یک دو سه');
    const long = Array.from({ length: 15 }, (_, i) => `ک${i}`).join(' ');
    expect(excerptWords(long)).toBe(`${Array.from({ length: 12 }, (_, i) => `ک${i}`).join(' ')}…`);
    expect(excerptWords('   ')).toBe('');
  });

  it('⚠️ رشتهٔ باز = ریشهٔ needs_review؛ تازه‌ترین پیام از زیردرخت (بزرگ‌ترین شناسه)', () => {
    const rows = [
      { id: 1, parentId: null, status: 'needs_review' },
      { id: 2, parentId: 1, status: 'needs_review' },
      { id: 3, parentId: 2, status: 'needs_review' },
      { id: 4, parentId: null, status: 'done' },
      { id: 5, parentId: 4, status: 'needs_review' }, // پاسخِ رشتهٔ بسته، ریشه نیست.
      { id: 6, parentId: null, status: 'needs_review' },
    ];
    const threads = openThreads(rows);
    expect(threads.map((x) => [x.root.id, x.latest.id])).toEqual([[1, 3], [6, 6]]);
  });

  it('پیوندِ هر نما به تبِ درست', () => {
    expect(focusHref('bids_pending', 7)).toBe('/projects/7?tab=tender');
    expect(focusHref('tasks_review', 7)).toBe('/projects/7?tab=tasks&view=review');
    expect(focusHref('comments_review', 7)).toBe('/projects/7?tab=comments');
    expect(focusHref('deadline_soon', 7)).toBe('/projects/7');
  });

  it('گروه‌بندی با حفظِ ترتیب', () => {
    const g = groupByProject([{ projectId: 2, v: 'a' }, { projectId: 1, v: 'b' }, { projectId: 2, v: 'c' }]);
    expect([...g.keys()]).toEqual([2, 1]);
    expect(g.get(2)!.map((x) => x.v)).toEqual(['a', 'c']);
  });
});
