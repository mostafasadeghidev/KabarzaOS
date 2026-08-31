/**
 * حضورِ زنده — «چه کسی الان اینجاست».
 *
 * منبع: `Support\Presence` (۳۴۴ خط).
 *
 * ⚠️ سه حالتِ **صادقانه**، نه دو حالت. کامنتِ خودِ نسخهٔ قبلی می‌گوید حالتِ میانی
 * همان چیزی است که قبلاً اشتباهاً به «آفلاین» می‌افتاد: تبی که باز است ولی
 * در پس‌زمینه. کاربری که تبش باز است با کسی که لپ‌تاپش را بسته یکی نیست.
 */

export type PresenceState = 'active' | 'idle' | 'offline';

export const PRESENCE_LABELS: Record<PresenceState, string> = {
  active: 'آنلاین',
  idle: 'باز ولی بی‌فعالیت',
  offline: 'آفلاین',
};

/** ثانیه — همان پیش‌فرض‌های نسخهٔ قبلی. */
export const PRESENCE_DEFAULTS = {
  /** فاصلهٔ ضربانِ تبِ فعال. */
  ping: 60,
  /** فعال ← بی‌فعالیت، پس از این مدت بدونِ ضربانِ تبِ **متمرکز**. */
  idleAfter: 120,
  /** ← آفلاین، پس از این مدت بدونِ **هیچ** ضربانی. */
  offlineAfter: 300,
} as const;

/**
 * مقادیرِ مجاز — عمداً فهرستِ کوتاه و امن، نه عددِ دلخواه.
 * ⚠️ ضربانِ خیلی کوتاه روی هاستِ ضعیف خودش می‌شود بار.
 */
export const PING_CHOICES = [15, 30, 60, 120] as const;
export const IDLE_CHOICES = [60, 120, 300] as const;
export const OFFLINE_CHOICES = [90, 150, 300, 600] as const;

function pick(value: number, choices: readonly number[], fallback: number): number {
  return choices.includes(value) ? value : fallback;
}

export interface PresenceConfig {
  ping: number;
  idleAfter: number;
  offlineAfter: number;
}

/** پیکربندیِ امن — هر مقدارِ خارج از فهرست به پیش‌فرض برمی‌گردد. */
export function normalizeConfig(input: Partial<PresenceConfig>): PresenceConfig {
  return {
    ping: pick(Number(input.ping), PING_CHOICES, PRESENCE_DEFAULTS.ping),
    idleAfter: pick(Number(input.idleAfter), IDLE_CHOICES, PRESENCE_DEFAULTS.idleAfter),
    offlineAfter: pick(Number(input.offlineAfter), OFFLINE_CHOICES, PRESENCE_DEFAULTS.offlineAfter),
  };
}

/**
 * حالت از روی دو مهرِ زمانی.
 *
 * ترتیبِ بررسی مهم است: **اول آفلاین**. کسی که هیچ ضربانی نفرستاده، حتی اگر
 * مهرِ «فعال»ِ قدیمی داشته باشد، آفلاین است — وگرنه یک تبِ بسته‌شده تا ابد
 * «فعال» می‌ماند.
 */
export function deriveState(input: {
  lastSeen: Date | null;
  lastActive: Date | null;
  now: Date;
  config: PresenceConfig;
}): PresenceState {
  const now = input.now.getTime();
  const seen = input.lastSeen?.getTime() ?? 0;
  const active = input.lastActive?.getTime() ?? 0;

  if (seen < now - input.config.offlineAfter * 1000) return 'offline';
  return active >= now - input.config.idleAfter * 1000 ? 'active' : 'idle';
}

/**
 * آیا این ضربان باید نوشته شود؟
 *
 * ⚠️ نوشتنِ هر ضربان یعنی یک نوشتنِ دیتابیس به‌ازای هر کاربر در هر دقیقه.
 * گلوگاه با فاصله‌ای کمی کوتاه‌تر از خودِ ضربان کنترل می‌شود تا ضربانِ
 * به‌موقع رد نشود، ولی ضربانِ زودهنگام هم بی‌جهت ننویسد.
 */
export function shouldWrite(input: {
  lastWrite: Date | null;
  now: Date;
  config: PresenceConfig;
}): boolean {
  if (!input.lastWrite) return true;
  const throttle = Math.max(5, input.config.ping - 10) * 1000;
  return input.now.getTime() - input.lastWrite.getTime() >= throttle;
}
