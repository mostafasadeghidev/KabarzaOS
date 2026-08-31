/**
 * مناقصه — ترجمهٔ `Support\Bids` و.
 *
 * مناقصه فقط تا وقتی «باز» است که پروژه هنوز در گروهِ وضعیتِ **lead** باشد؛
 * به‌محضِ شروعِ کار، برنده قفل می‌شود.
 */

export type TenderPhase = 'none' | 'open' | 'closed' | 'cancelled';

/**
 * ⚠️ R-TENDER-01 — فازِ مناقصه از **گروهِ وضعیتِ پروژه** مشتق می‌شود، نه یک
 * پرچمِ جدا. تا وقتی «احتمالِ عقد قرارداد» است باز است؛ هر وضعیتِ دیگری
 * (جز لغو) یعنی کار شروع شده و پیشنهادها قفل‌اند.
 */
export function tenderPhase(isTender: boolean, statusGroup: string | null): TenderPhase {
  if (!isTender) return 'none';
  if (statusGroup === 'lead') return 'open';
  if (statusGroup === 'cancelled') return 'cancelled';
  return 'closed';
}

export function tenderIsOpen(isTender: boolean, statusGroup: string | null): boolean {
  return tenderPhase(isTender, statusGroup) === 'open';
}

export interface Bid {
  id: number;
  userId: number;
  roleTagId: number;
  amount: string;
  currencyId: number | null;
  status: 'pending' | 'approved' | 'archived' | 'withdrawn';
}

export type ApprovePlan =
  | { action: 'locked' }
  | { action: 'noop' }
  | {
      action: 'approve';
      /** برندهٔ قبلیِ **همین نقش** که باید کنار برود (اگر باشد). */
      unseat: { bidId: number; userId: number } | null;
      /** عضوی که باید روی پروژه ساین شود. */
      sign: { userId: number; roleTagId: number; amount: string; currencyId: number | null };
    };

/**
 * نقشهٔ تأییدِ یک پیشنهاد.
 *
 * ⚠️ سه قاعده:
 *  ۱. اگر مناقصه باز نباشد هیچ‌کاری انجام نمی‌شود — برنده پس از شروعِ کار عوض نمی‌شود.
 *  ۲. تأییدِ دوبارهٔ همان پیشنهاد بی‌اثر است، نه اینکه دوباره ساین بزند.
 *  ۳. برندهٔ قبلیِ **همان نقش** از عضویت برداشته و پیشنهادش به «در انتظار»
 *     برمی‌گردد — نه اینکه هر دو هم‌زمان برنده بمانند. نقش‌های **دیگر** دست‌نخورده‌اند،
 *     چون سقفِ قیمت per-role است.
 */
export function planApproveBid(
  bid: Bid,
  allBids: Bid[],
  context: { isOpen: boolean; projectCurrencyId: number | null },
): ApprovePlan {
  if (!context.isOpen) return { action: 'locked' };
  if (bid.status === 'approved') return { action: 'noop' };

  const current = allBids.find(
    (b) => b.roleTagId === bid.roleTagId && b.status === 'approved' && b.id !== bid.id,
  );

  return {
    action: 'approve',
    unseat: current ? { bidId: current.id, userId: current.userId } : null,
    sign: {
      userId: bid.userId,
      roleTagId: bid.roleTagId,
      amount: bid.amount,
      // ارزِ خودِ پیشنهاد مقدم است؛ نبودنش یعنی ارزِ پروژه.
      currencyId: bid.currencyId ?? context.projectCurrencyId,
    },
  };
}

/**
 * پس‌گرفتنِ پیشنهاد.
 * ⚠️ اگر پیشنهادِ برنده پس گرفته شود، عضویتِ ساین‌شده هم باید برداشته شود —
 * وگرنه کسی که دیگر برنده نیست همچنان روی پروژه دستمزد داشت.
 */
export function planWithdrawBid(bid: Bid): { unsign: boolean; nextStatus: 'withdrawn' } {
  return { unsign: bid.status === 'approved', nextStatus: 'withdrawn' };
}

/* ------------------------------------------------------------------ *
 * مناقصه از سمتِ عضو
 * ------------------------------------------------------------------ */

/**
 * نقش‌های بازِ این پروژه برای این کاربر — پورتِ
 *.
 *
 * دو شرط:
 *  ۱. کاربر آن نقش را **دارد** (تگِ نقشش)
 *  ۲. آن نقش هنوز به کسی **واگذار نشده**
 *
 * ⚠️ شرطِ دوم per-role است، نه per-project: پروژه‌ای که نقشِ «طراح»ش
 * واگذار شده هنوز برای «دولوپر» باز است. یک گاردِ سطحِ پروژه، بقیهٔ
 * نقش‌ها را هم بی‌دلیل می‌بست.
 */
export function openRolesForUser(input: {
  isTender: boolean;
  tenderRoleIds: readonly number[];
  userRoleTagIds: readonly number[];
  awardedRoleIds: readonly number[];
}): number[] {
  if (!input.isTender) return [];
  return input.tenderRoleIds.filter(
    (rid) => input.userRoleTagIds.includes(rid) && !input.awardedRoleIds.includes(rid),
  );
}

export function isTenderEligible(input: Parameters<typeof openRolesForUser>[0]): boolean {
  return openRolesForUser(input).length > 0;
}

export type BidRejection = 'amount_invalid' | 'over_cap' | 'role_closed' | 'tender_closed';

export const BID_MESSAGES: Record<BidRejection, string> = {
  amount_invalid: 'مبلغِ پیشنهادی معتبر نیست.',
  over_cap: 'مبلغِ پیشنهادی از سقفِ این نقش بیشتر است.',
  role_closed: 'این نقش قبلاً واگذار شده است.',
  tender_closed: 'مناقصه بسته است.',
};

/**
 * اعتبارسنجیِ پیشنهاد. `null` یعنی مجاز.
 *
 * ⚠️ سقف اگر **صفر یا خالی** باشد یعنی «بدونِ سقف»، نه «سقفِ صفر» — وگرنه
 * هر پیشنهادی روی نقشِ بی‌سقف رد می‌شد.
 */
export function validateBid(input: {
  amount: string;
  cap: string | null;
  roleIsAwarded: boolean;
  tenderIsOpen: boolean;
}): BidRejection | null {
  if (!input.tenderIsOpen) return 'tender_closed';
  if (input.roleIsAwarded) return 'role_closed';

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'amount_invalid';

  const cap = Number(input.cap ?? 0);
  if (cap > 0 && amount - cap > 0.0001) return 'over_cap';
  return null;
}

/* ------------------------------------------------------------------ *
 * جدولِ نقش/سقفِ مناقصه
 * ------------------------------------------------------------------ */

export interface TenderRoleRow {
  roleTagId: number;
  cap: string;
}

export interface TenderRolesPlan {
  /** نگاشتِ نهایی: شناسهٔ نقش ← سقف (رشتهٔ پول). */
  roles: Record<string, string>;
  isTender: boolean;
  /** نقش‌هایی که **تازه** اضافه شده‌اند و باید اعلام شوند. */
  newlyAnnounced: number[];
  /** فهرستِ به‌روزِ «اعلام‌شده‌ها» برای ذخیره. */
  announced: number[];
}

/**
 * برنامهٔ ذخیرهٔ جدولِ نقش‌های مناقصه.
 *
 * ⚠️ **تیکِ مناقصه بدونِ نقش، مناقصه نیست.** پروژه‌ای که پرچم دارد ولی هیچ
 * نقشی برایش تعریف نشده، هیچ‌کس نمی‌تواند برایش پیشنهاد بدهد؛ نشان‌دادنش
 * به‌عنوانِ مناقصه فقط گمراه‌کننده است.
 *
 * ⚠️ **اعلان فقط برای نقش‌های تازه.** افزودنِ «حسابدار» به مناقصه‌ای که قبلاً
 * برای «دولوپر» اعلام شده فقط حسابدارها را خبر می‌کند، نه اینکه دوباره به
 * همه پیام بدهد. خاموش‌کردنِ مناقصه فهرست را صفر می‌کند تا بازکردنِ دوباره
 * از نو اعلام شود.
 */
export function planTenderRoles(input: {
  checked: boolean;
  rows: readonly TenderRoleRow[];
  previouslyAnnounced: readonly number[];
}): TenderRolesPlan {
  const roles: Record<string, string> = {};
  for (const row of input.rows) {
    if (!Number.isInteger(row.roleTagId) || row.roleTagId <= 0) continue;
    const cap = Number(row.cap);
    // سقفِ نامعتبر یا منفی یعنی «بدونِ سقف» (صفر)، نه خطا.
    roles[String(row.roleTagId)] = (Number.isFinite(cap) && cap > 0 ? cap : 0).toFixed(4);
  }

  const current = Object.keys(roles).map(Number);
  const isTender = input.checked && current.length > 0;

  if (!isTender) {
    return { roles: {}, isTender: false, newlyAnnounced: [], announced: [] };
  }

  const announced = input.previouslyAnnounced.map(Number);
  return {
    roles,
    isTender: true,
    newlyAnnounced: current.filter((rid) => !announced.includes(rid)),
    announced: [...new Set([...announced, ...current])],
  };
}
