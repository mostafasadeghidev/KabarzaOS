import { createTranslator, type Translator } from '@/i18n/translate';

/**
 * برچسب‌های پیام‌رسان — پورتِ `Messages::other_label_from()`,
 * `person_label()`, `read_states()` و `inbox_view()`.
 *
 * ⚠️ R-MSG-03: عضو و کارفرما به‌جای نامِ واقعیِ مدیر «مدیریت» می‌بینند، و
 * **همهٔ** مدیرانِ یک گفتگو در یک برچسب جمع می‌شوند — بدونِ نام و بدونِ
 * تعداد. مدیران نامِ واقعیِ همه را می‌بینند. پیش از این صندوق و گفتگو نامِ
 * واقعیِ مدیران را چاپ می‌کردند (MESSAGING.md همین را ❌ ثبت کرده بود).
 *
 * «مدیر» اینجا یعنی هر کسی که می‌تواند به نامِ سازمان بفرستد: مالک، همکارِ
 * ادمین، و کارمندی که مجوزِ ارسال دارد — همان `can_broadcast()` ِ نسخهٔ قبلی.
 */

/** بدونِ مترجم همان فارسیِ مبدأ — کلید خودِ متنِ فارسی است. */
const SOURCE: Translator = createTranslator({});

export const MANAGEMENT_LABEL = 'مدیریت';

export interface LabelContext {
  viewerId: number;
  /** بیننده خودش مدیر است؟ — نامِ واقعیِ همه را می‌بیند. */
  viewerIsManager: boolean;
  managerIds: ReadonlySet<number>;
  names: ReadonlyMap<number, string>;
}

/** نامی که بیننده از یک شرکت‌کننده می‌بیند. */
export function personLabel(otherId: number, ctx: LabelContext, t: Translator = SOURCE): string {
  if (!ctx.viewerIsManager && ctx.managerIds.has(otherId)) return t(MANAGEMENT_LABEL);
  return ctx.names.get(otherId) ?? `#${otherId}`;
}

/**
 * برچسبِ «طرفِ مقابل» در صندوق و سربرگِ گفتگو.
 *
 * ⚠️ مدیران در **یک** کلید جمع می‌شوند، پس گفتگویی با دو مدیر برای عضو
 * «مدیریت» است — نه «مدیریت و ۱ نفر دیگر» (تستِ R-MSG-03).
 */
export function counterpartLabel(
  participantIds: readonly number[],
  ctx: LabelContext,
  t: Translator = SOURCE,
): string {
  const others = [...new Set(participantIds)].filter((id) => id !== ctx.viewerId);
  if (others.length === 0) return '';

  const labels = new Map<string, string>();
  for (const id of others) {
    if (!ctx.viewerIsManager && ctx.managerIds.has(id)) labels.set('mgmt', t(MANAGEMENT_LABEL));
    else labels.set(`u${id}`, ctx.names.get(id) ?? `#${id}`);
  }
  const list = [...labels.values()];
  if (list.length === 1) return list[0]!;
  return `${list[0]} ${t('و {n} نفر دیگر', { n: list.length - 1 })}`;
}

/**
 * تا کدام پیام **همهٔ** طرف‌های دیگر خوانده‌اند — پایهٔ تیکِ ✓✓ (R-MSG-07).
 * بدونِ طرفِ دیگر، صفر: هیچ پیامی «خوانده‌شده» نیست.
 */
export function readUpTo(
  states: ReadonlyArray<{ userId: number; lastReadMessageId: number | null }>,
  viewerId: number,
): number {
  const others = states.filter((s) => s.userId !== viewerId).map((s) => s.lastReadMessageId ?? 0);
  return others.length === 0 ? 0 : Math.min(...others);
}

export interface InboxThreadLike {
  id: number;
  broadcastId: number | null;
  isMine: boolean;
  unread: number;
}

export type InboxEntry<T extends InboxThreadLike> =
  | { kind: 'single'; thread: T }
  | { kind: 'group'; broadcastId: number; threads: T[]; unread: number };

/**
 * صندوقِ نمایشی — گفتگوهای یک ارسالِ همگانی در صندوقِ **فرستنده** یک
 * آکاردئون می‌شوند (R-MSG-01)؛ گیرنده هر کدام را جداگانه و بی‌خبر از بقیه
 * می‌بیند، پس فقط `isMine` گروه می‌شود. ترتیبِ ورودی حفظ می‌شود.
 */
export function groupInbox<T extends InboxThreadLike>(rows: readonly T[]): InboxEntry<T>[] {
  const entries: InboxEntry<T>[] = [];
  const groups = new Map<number, Extract<InboxEntry<T>, { kind: 'group' }>>();
  for (const row of rows) {
    if (row.isMine && row.broadcastId) {
      let group = groups.get(row.broadcastId);
      if (!group) {
        group = { kind: 'group', broadcastId: row.broadcastId, threads: [], unread: 0 };
        groups.set(row.broadcastId, group);
        entries.push(group);
      }
      group.threads.push(row);
      group.unread += row.unread;
    } else {
      entries.push({ kind: 'single', thread: row });
    }
  }
  // گروهِ یک‌نفره گروه نیست — یک ارسالِ همگانی که فقط یک گیرنده‌اش مانده.
  return entries.map((e) => (e.kind === 'group' && e.threads.length === 1
    ? { kind: 'single', thread: e.threads[0]! }
    : e));
}
