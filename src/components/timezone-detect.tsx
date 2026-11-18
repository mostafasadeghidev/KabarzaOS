'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { adoptTimezoneAction } from '@/app/(app)/_actions/timezone';

/**
 * تشخیصِ منطقهٔ زمانی از دستگاه (۳.۱۵.۱) — فقط برای کاربری که هرگز منطقه انتخاب نکرده (چیدمان
 * همین را می‌سنجد). یک بار می‌فرستد؛ اگر ذخیره شد صفحه تازه می‌شود تا ساعت‌ها به وقتِ او باشند.
 * انتخابِ دستی در «پروفایل» همیشه بر این مقدم است.
 */
export function TimezoneDetect() {
  const router = useRouter();
  useEffect(() => {
    let zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { /* مرورگرِ قدیمی */ }
    if (!zone) return;
    let cancelled = false;
    adoptTimezoneAction(zone)
      .then((saved) => { if (saved && !cancelled) router.refresh(); })
      .catch(() => { /* بی‌صدا — دفعهٔ بعد دوباره */ });
    return () => { cancelled = true; };
  }, [router]);
  return null;
}
