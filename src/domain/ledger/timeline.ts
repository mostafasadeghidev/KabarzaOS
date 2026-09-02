/**
 * تاریخچهٔ که/کِیِ یک ردیفِ دفتر — پورتِ `edit_log` ِ نسخهٔ قبلی.
 *
 * ⚠️ منبع همان audit_log ِ مشترک است، نه یک ستونِ JSON ِ موازی روی ردیف:
 * یک حقیقت، یک جا. این ماژول فقط ردیف‌های خامِ audit را به تاریخچهٔ هر
 * ردیف و «آخرین عامل» تبدیل می‌کند.
 */

export interface LedgerEvent {
  /** `ledger.update` ویرایش است؛ ساخت و انتقال «ساخت». */
  action: 'create' | 'update';
  /** ISO 8601 — کلاینت در منطقهٔ زمانیِ بیننده نشان می‌دهد. */
  at: string;
  /** نامِ عامل؛ کاربرِ حذف‌شده → رشتهٔ خالی. */
  name: string;
}

export interface AuditRowLike {
  id: number | string;
  action: string;
  at: Date | string;
  name: string | null;
}

export function eventKind(action: string): LedgerEvent['action'] {
  return action === 'ledger.update' ? 'update' : 'create';
}

/** ردیف‌های audit (به ترتیبِ وقوع) → تاریخچهٔ هر ردیفِ دفتر. */
export function buildTimelines(rows: readonly AuditRowLike[]): Map<number, LedgerEvent[]> {
  const out = new Map<number, LedgerEvent[]>();
  for (const r of rows) {
    const id = Number(r.id);
    const list = out.get(id) ?? [];
    list.push({ action: eventKind(r.action), at: new Date(r.at).toISOString(), name: r.name ?? '' });
    out.set(id, list);
  }
  return out;
}

/** «توسط» — نامِ آخرین رویداد؛ بی‌رویداد یا بی‌نام → null. */
export function lastActorOf(events: readonly LedgerEvent[] | undefined): string | null {
  const last = events?.[events.length - 1];
  return last && last.name !== '' ? last.name : null;
}
