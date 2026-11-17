import 'server-only';
import pkg from '../../../package.json';

/**
 * نسخهٔ برنامه‌ای که **همین حالا** روی سرور اجرا می‌شود (۳.۶.۰) — برای «تنظیمات ← سامانه».
 *
 * ⚠️ از `package.json` ِ داخلِ همان ساخت خوانده می‌شود، نه از GitHub: اگر بعد از Redeploy عدد عوض
 * نشد، یعنی دیپلوی هنوز انجام نشده یا خطا خورده.
 */
export interface AppVersionInfo {
  version: string;
  /** زمانِ ساختِ ایمیج (= آخرین دیپلوی)؛ `null` در محیطی که بی آن ساخته شده. */
  builtAt: string | null;
  /** زمانِ روشن شدنِ همین فرایند (آخرین راه‌اندازیِ دوباره). */
  startedAt: string;
}

export function appVersionInfo(): AppVersionInfo {
  const built = process.env.KABARZA_BUILD_TIME;
  return {
    version: pkg.version,
    builtAt: built && !Number.isNaN(Date.parse(built)) ? built : null,
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  };
}
