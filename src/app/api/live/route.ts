import { routeActor } from '@/server/auth';
import { getSystemConfig } from '@/server/settings/system-service';
import { subscribe, type LiveEvent } from '@/server/live/hub';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * خطِ بازِ خبرهای لحظه‌ای (Server-Sent Events، ۳.۱۴.۰).
 *
 * مرورگر یک بار وصل می‌شود و سرور هر وقت چیزی برای او عوض شد خبر می‌دهد:
 *  · `pulse` — شمارِ اعلان/پیام/نخوانده‌اش عوض شد ← مرورگر `/api/pulse` را می‌خواند؛
 *  · `m` + شمارهٔ گفتگو — پیامی در آن گفتگو آمد/عوض شد ← اگر همان باز است، تازه می‌شود.
 *
 * ⚠️ خبر **هیچ محتوایی** ندارد: نه متنِ پیام، نه عنوانِ اعلان. داده همیشه از همان مسیرهای قبلی و با
 * همان گاردها خوانده می‌شود؛ پس این خط چیزی را که کسی حقش را ندارد لو نمی‌دهد. خبرِ اعلان و «خواندن»
 * فقط به خودِ صاحبش می‌رسد؛ خبرِ گفتگو فقط شماره است و گفتگوی دیگران را باز نمی‌کند.
 * ⚠️ `Content-Encoding: none` و `X-Accel-Buffering: no`: فشرده‌سازی یا بافرِ پراکسی خبرها را نگه
 * می‌داشت و «لحظه‌ای» دیگر لحظه‌ای نبود. هر ۲۵ ثانیه یک «ضربان» تا پراکسی خط را نبندد.
 */
export async function GET(request: Request) {
  const actor = await routeActor({ allowOffboarded: true });
  if (!actor) return new Response(null, { status: 403 });
  const system = await getSystemConfig();
  if (!system.pulseEnabled) return new Response(null, { status: 204 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        try { controller.enqueue(encoder.encode(text)); } catch { cleanup(); }
      };
      let unsubscribe: () => void;
      try {
        unsubscribe = await subscribe((e: LiveEvent) => {
          if ((e.k === 'n' || e.k === 'r') && e.u === actor.id) send('event: pulse\ndata: 1\n\n');
          else if (e.k === 'm') send(`event: m\ndata: ${e.t}\n\n`);
        });
      } catch {
        // گوش دادن ممکن نشد ← مرورگر به پرسیدنِ دوره‌ای برمی‌گردد.
        controller.close();
        return;
      }
      const ping = setInterval(() => send(': ping\n\n'), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
        try { controller.close(); } catch { /* بسته بود */ }
      };
      request.signal.addEventListener('abort', () => cleanup());
      // اولِ کار: مرورگر بداند خط برقرار است و یک بار همه‌چیز را تازه کند.
      send('retry: 5000\nevent: ready\ndata: 1\n\n');
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Content-Encoding': 'none',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
