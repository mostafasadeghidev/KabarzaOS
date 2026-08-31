import { timingSafeEqual } from 'node:crypto';
import { runTick } from '@/server/scheduler/service';

/**
 * تیکِ زمان‌بند.
 *
 * ⚠️ اینجا نشستِ کاربر نیست، پس گاردش یک **رازِ مشترک** است که زمان‌بندِ
 * بیرونی (Coolify / crontab) در هدر می‌فرستد. بدونِ تنظیمِ راز، مسیر
 * **بسته** است — نه باز؛ یک نقطهٔ پایانیِ بی‌گارد که هر کسی می‌تواند صدا
 * بزند یعنی هر کسی می‌تواند پاک‌سازی و اعلان راه بیندازد.
 *
 * نمونهٔ فراخوانی (هر پنج دقیقه):
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app/api/cron/tick
 */

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET ?? '';
  if (!expected) return false;

  const given = request.headers.get('x-cron-secret') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // مقایسهٔ زمان‌ثابت تا طولِ راز از زمانِ پاسخ حدس زده نشود.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response(null, { status: 403 });

  const report = await runTick();
  return Response.json(report, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const POST = GET;
