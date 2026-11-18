import 'server-only';
import { sql } from '@/db/client';

/**
 * گیرندهٔ خبرهای لحظه‌ای (۳.۱۴.۰) — یک گوش به کانالِ `kz_live` ِ Postgres برای کلِ فرایند، و پخش
 * به همهٔ اتصال‌های بازِ مرورگرها (`/api/live`). خبر را تریگرهای مهاجرتِ ۰۰۸۱ می‌سازند.
 *
 * ⚠️ یکی برای فرایند (`globalThis`): با هر اتصالِ مرورگر یک LISTEN ِ تازه، استخرِ اتصال‌های دیتابیس
 * را تمام می‌کرد. اگر گوش دادن شکست بخورد، مرورگرها به همان پرسیدنِ دوره‌ای برمی‌گردند.
 */

export type LiveEvent =
  | { k: 'n'; u: number } // اعلانِ تازه یا خوانده‌شده برای کاربرِ u
  | { k: 'r'; u: number } // کاربرِ u گفتگویی را خواند (شمارِ نخوانده‌اش عوض شد)
  | { k: 'm'; t: number }; // پیامی در گفتگوی t نوشته، ویرایش یا پاک شد

type Listener = (event: LiveEvent) => void;

interface Hub { listeners: Set<Listener>; started: Promise<void> | null }
const g = globalThis as unknown as { __kzLiveHub?: Hub };
const hub: Hub = g.__kzLiveHub ?? (g.__kzLiveHub = { listeners: new Set(), started: null });

function parse(payload: string): LiveEvent | null {
  try {
    const e = JSON.parse(payload) as Record<string, unknown>;
    if ((e.k === 'n' || e.k === 'r') && Number.isInteger(e.u)) return { k: e.k, u: e.u as number };
    if (e.k === 'm' && Number.isInteger(e.t)) return { k: 'm', t: e.t as number };
  } catch { /* خبرِ خراب نادیده گرفته می‌شود */ }
  return null;
}

function start(): Promise<void> {
  hub.started ??= sql.listen('kz_live', (payload) => {
    const event = parse(payload);
    if (!event) return;
    for (const fn of hub.listeners) {
      try { fn(event); } catch { /* یک اتصالِ خراب نباید بقیه را بیندازد */ }
    }
  }).then(() => undefined).catch((error) => {
    console.error('[live] listen failed', error);
    hub.started = null; // تلاشِ دوباره با اتصالِ بعدی
    throw error;
  });
  return hub.started;
}

/** گوش دادن به خبرها؛ تابعِ برگشتی گوش دادن را تمام می‌کند. */
export async function subscribe(fn: Listener): Promise<() => void> {
  await start();
  hub.listeners.add(fn);
  return () => { hub.listeners.delete(fn); };
}
