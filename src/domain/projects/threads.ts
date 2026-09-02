import { closedStatus, OPEN_STATUS, type CommentType } from './comments';

/**
 * رشته‌های کامنت/بازبینی — پورتِ `render_thread` ِ افزونه.
 *
 * ⚠️ وضعیتِ یک رشته وضعیتِ **تازه‌ترین پیامِ** آن است (بزرگ‌ترین شناسه در
 * زیردرخت)، نه ریشه: پاسخِ تازه رشتهٔ بسته را دوباره باز می‌کند و نشانِ
 * وضعیت و کنترلش فقط روی همان پیامِ آخر می‌نشیند.
 */

export interface ThreadNode {
  id: number;
  parentId: number | null;
  status: string;
}

export interface Thread<T extends ThreadNode> {
  root: T;
  /** پاسخ‌ها به ترتیبِ زمان (کهنه‌تر اول)، صاف‌شده با عمق. */
  replies: Array<{ node: T; depth: number }>;
  latest: T;
  /** وضعیتِ رشته = وضعیتِ تازه‌ترین پیام. */
  status: string;
}

export function buildThreads<T extends ThreadNode>(
  rows: readonly T[],
  type: CommentType,
): { open: Array<Thread<T>>; closed: Array<Thread<T>> } {
  const byId = new Map<number, T>();
  const children = new Map<number, T[]>();
  for (const r of rows) {
    byId.set(r.id, r);
    if (r.parentId !== null) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r]);
  }
  // پاسخ‌ها کهنه‌تر اول.
  for (const list of children.values()) list.sort((a, b) => a.id - b.id);

  const subtreeMax = (id: number): number =>
    (children.get(id) ?? []).reduce((max, child) => Math.max(max, subtreeMax(child.id)), id);

  const flatten = (id: number, depth: number, out: Array<{ node: T; depth: number }>) => {
    for (const child of children.get(id) ?? []) {
      out.push({ node: child, depth });
      flatten(child.id, depth + 1, out);
    }
    return out;
  };

  const closed = closedStatus(type);
  // ریشه‌ها تازه‌تر اول.
  const roots = rows.filter((r) => r.parentId === null || !byId.has(r.parentId)).sort((a, b) => b.id - a.id);
  const threads = roots.map((root) => {
    const latest = byId.get(subtreeMax(root.id)) ?? root;
    const status = latest.status || OPEN_STATUS;
    return { root, replies: flatten(root.id, 1, []), latest, status };
  });
  return {
    open: threads.filter((t) => t.status !== closed),
    closed: threads.filter((t) => t.status === closed),
  };
}

/** پورتِ `count_needs_review`: رشته‌هایی که تازه‌ترین پیامشان بررسی می‌خواهد. */
export function countOpenThreads<T extends ThreadNode>(rows: readonly T[], type: CommentType = 'comment'): number {
  return buildThreads(rows, type).open.length;
}
