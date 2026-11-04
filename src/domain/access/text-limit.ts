import { ForbiddenError } from './guard';

/**
 * سقفِ طولِ متنی که کاربر می‌نویسد: کامنت، یادداشتِ تسک، پیام، یادآور (۲.۵۷.۰).
 *
 * ⚠️ پیش از این سقفی نبود: هر کس — حتی کارفرما — می‌توانست متنی چند
 * مگابایتی بگذارد که با هر بار بازشدنِ صفحه پردازش می‌شد. ۲۰ هزار نویسه
 * برای هر نوشتهٔ واقعی بس است.
 */
export const MAX_TEXT_LENGTH = 20_000;

export const TEXT_TOO_LONG = 'متن خیلی طولانی است؛ حداکثر ۲۰٬۰۰۰ نویسه.';

export function isTooLong(text: string): boolean {
  return text.length > MAX_TEXT_LENGTH;
}

/** گاردِ لایهٔ سرویس — مسیرهای دیگر (MCP، تلگرام) هم از همین می‌گذرند. */
export function assertTextLength(text: string): void {
  if (isTooLong(text)) throw new ForbiddenError('text.too_long');
}

/**
 * سقفِ رگبار: بیش از این تعداد نوشته در یک دقیقه از یک نفر پذیرفته نمی‌شود
 * (۲.۵۷.۰) — جلوی پر کردنِ گروه یا رشتهٔ کامنت با اسپم را می‌گیرد، نه کارِ عادی را.
 */
export const BURST_LIMIT = 20;
export const BURST_WINDOW_SECONDS = 60;

export const TEXT_BURST = 'پشتِ‌سرِ‌هم زیاد نوشتید؛ یک دقیقه صبر کنید.';

export function assertNotBurst(recentCount: number): void {
  if (recentCount >= BURST_LIMIT) throw new ForbiddenError('text.burst');
}

/** پیامِ کاربرپسندِ دو گاردِ بالا؛ برای بقیهٔ خطاها null. */
export function textLimitMessage(error: unknown): string | null {
  if (!(error instanceof ForbiddenError)) return null;
  if (error.required === 'text.too_long') return TEXT_TOO_LONG;
  if (error.required === 'text.burst') return TEXT_BURST;
  return null;
}
