/**
 * سلامتِ زمان‌بند — پورتِ کارت‌های `settings/health.php`.
 *
 * ⚠️ چرا مهم است: تیکِ زمان‌بند از **بیرون** صدا زده می‌شود (cron/Task
 * Scheduler). اگر آن کرون قطع شود، هیچ خطایی جایی ظاهر نمی‌شود — فقط
 * یادآورها نمی‌رسند، مرخصیِ کهنه پاک نمی‌شود و گزارشِ روزانه نمی‌آید. یعنی
 * یک خرابیِ کاملاً خاموش. این کارت تنها جایی است که آن را می‌بیند.
 */

/** بیش از این مقدار سکوت یعنی زمان‌بند احتمالاً نمی‌دود. */
export const STALE_AFTER_MINUTES = 30;

export type HealthTone = 'ok' | 'warn' | 'bad';

export interface SchedulerHealth {
  tone: HealthTone;
  /** دقیقه از آخرین تیک؛ `null` = هرگز نرفته. */
  minutesAgo: number | null;
}

export function schedulerHealth(lastTick: string | null, now: Date): SchedulerHealth {
  if (!lastTick) return { tone: 'bad', minutesAgo: null };

  const at = new Date(lastTick);
  if (Number.isNaN(at.getTime())) return { tone: 'bad', minutesAgo: null };

  const minutesAgo = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));

  /**
   * ⚠️ سه حالت، نه دو: «تازه» سبز، «کمی دیر» زرد، «خیلی دیر» قرمز. حالتِ
   * زرد لازم است چون تیک هر ۵ دقیقه است و یک تأخیرِ کوتاه طبیعی است؛
   * قرمزکردنِ آن، هشدار را بی‌ارزش می‌کرد.
   */
  if (minutesAgo <= STALE_AFTER_MINUTES) return { tone: 'ok', minutesAgo };
  if (minutesAgo <= STALE_AFTER_MINUTES * 4) return { tone: 'warn', minutesAgo };
  return { tone: 'bad', minutesAgo };
}

/** «۳ ساعت پیش» / «۱۲ دقیقه پیش» — واحد از خودِ عدد می‌آید. */
export function agoParts(minutesAgo: number): { value: number; unit: 'minute' | 'hour' | 'day' } {
  if (minutesAgo < 60) return { value: minutesAgo, unit: 'minute' };
  if (minutesAgo < 60 * 24) return { value: Math.floor(minutesAgo / 60), unit: 'hour' };
  return { value: Math.floor(minutesAgo / (60 * 24)), unit: 'day' };
}
