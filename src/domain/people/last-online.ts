/**
 * «چند وقت پیش» (۲.۶۴.۰) — مشترکِ کارتِ عضو و «حضور و مرخصیِ تیم».
 * بازهٔ درشت کافی است؛ ثانیه هر ثانیه کهنه می‌شود.
 */
export function agoLabel(
  at: Date | string,
  t: (s: string, v?: Record<string, string | number>) => string,
  now: number = Date.now(),
): string {
  const seconds = Math.max(0, Math.floor((now - new Date(at).getTime()) / 1000));
  if (seconds < 60) return t('همین حالا');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('{n} دقیقه پیش', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('{n} ساعت پیش', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 60) return t('{n} روز پیش', { n: days });
  return t('{n} ماه پیش', { n: Math.floor(days / 30) });
}
