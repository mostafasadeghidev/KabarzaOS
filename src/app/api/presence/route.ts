import { currentActor } from '@/server/auth';
import { markOffline, presenceEnabled, touch } from '@/server/people/presence-service';

/**
 * ضربانِ حضور.
 *
 * ⚠️ عمداً سبک است: نه بدنهٔ سنگین، نه پاسخِ پرحجم. `keepalive` ِ مرورگر
 * هنگامِ بستنِ تب هم همین مسیر را با `state=offline` صدا می‌زند.
 */
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return new Response(null, { status: 204 });

  // ⚠️ گاردِ سمتِ سرور (R-ARCH-01): سوارنشدنِ کامپوننت کافی نیست — هر کسی
  // می‌تواند مستقیم این مسیر را صدا بزند.
  if (!(await presenceEnabled())) return new Response(null, { status: 204 });

  const url = new URL(request.url);
  if (url.searchParams.get('state') === 'offline') {
    await markOffline(actor);
  } else {
    await touch(actor, url.searchParams.get('focused') === '1');
  }

  return new Response(null, { status: 204 });
}
