/**
 * نشانیِ IP ِ واقعیِ کاربر از هدرِ `X-Forwarded-For` (۲.۵۷.۰).
 *
 * ⚠️ پیش از این **اولین** نشانیِ فهرست برداشته می‌شد — همانی که خودِ کاربر
 * می‌نویسد. nginx و بیشترِ پراکسی‌ها نشانیِ واقعی را **ته** ِ فهرست اضافه
 * می‌کنند؛ پس با یک هدرِ جعلی هر درخواست IP ِ تازه‌ای داشت و محدودیتِ تلاشِ
 * ورود و فرمِ فراموشیِ رمز بی‌اثر می‌شد.
 *
 * حالا از ته شمرده می‌شود: `TRUSTED_PROXY_HOPS` (پیش‌فرض ۱) تعدادِ
 * پراکسی‌های خودِ ماست — مثلاً Cloudflare جلوی nginx یعنی ۲.
 */
export function clientIpFrom(forwardedFor: string | null | undefined, hops = trustedHops()): string | null {
  if (!forwardedFor) return null;
  const list = forwardedFor.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return null;
  return list[Math.max(0, list.length - hops)] ?? null;
}

function trustedHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  return Number.isInteger(raw) && raw >= 1 && raw <= 5 ? raw : 1;
}
