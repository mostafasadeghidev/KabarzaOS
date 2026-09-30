import { currentActor } from '@/server/auth';
import { markOffline, presenceSettings, touch } from '@/server/people/presence-service';
import { livePresence } from '@/server/availability/service';

/**
 * ضربانِ حضور.
 *
 * ⚠️ عمداً سبک است: نه بدنهٔ سنگین، نه پاسخِ پرحجم. `keepalive` ِ مرورگر
 * هنگامِ بستنِ تب هم همین مسیر را با `state=offline` صدا می‌زند.
 * ⚠️ تنظیمات **یک بار** خوانده می‌شود — این مسیر هر دقیقه از هر تبِ باز صدا
 * زده می‌شود و پیش از این هر ضربان دو بار سراغِ ردیفِ تنظیمات می‌رفت.
 */
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return new Response(null, { status: 204 });

  // ⚠️ گاردِ سمتِ سرور (R-ARCH-01): سوارنشدنِ کامپوننت کافی نیست — هر کسی
  // می‌تواند مستقیم این مسیر را صدا بزند.
  const { enabled, config } = await presenceSettings();
  if (!enabled) return new Response(null, { status: 204 });

  const url = new URL(request.url);
  if (url.searchParams.get('state') === 'offline') {
    await markOffline(actor);
  } else {
    await touch(actor, url.searchParams.get('focused') === '1', config);
  }

  return new Response(null, { status: 204 });
}

/** سقفِ شناسه در یک پرسش — صفحه‌ای با صدها نقطه هم در همین جا می‌شود. */
const MAX_IDS = 300;

/**
 * حالتِ زندهٔ نقطه‌های حضورِ صفحه — `?ids=1,2,3` → `{ "1": "active", … }`.
 * فقط شناسه‌هایی که بیننده در دامنه‌اش دارد برمی‌گردند (`livePresence`).
 */
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({}, { status: 401 });

  const raw = new URL(request.url).searchParams.get('ids') ?? '';
  const ids = raw.split(',')
    .map((part) => Number(part))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_IDS);

  const states = await livePresence(actor, ids);
  return Response.json(states, { headers: { 'Cache-Control': 'no-store' } });
}
