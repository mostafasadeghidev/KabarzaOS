'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/** تصویرِ پیش‌فرضِ آواتار — نسخهٔ ۲۵۶ پیکسلیِ لوگو (۱۲ کیلوبایت) در `public`. */
export const DEFAULT_AVATAR_SRC = '/avatar-default.webp';

/**
 * آواتارِ پیش‌فرض برای کسی که عکس ندارد (۲.۵.۰، به خواستِ کاربر: «آواتارِ
 * خالی نداشته باشیم»). اگر خودِ این تصویر هم بار نشد (شبکه، فایلِ جاافتاده)،
 * همان `fallback` ِ قبلی — حرفِ اول یا تک‌نگارِ رنگی — نشان داده می‌شود.
 *
 * ⚠️ برای کسی که نامش پنهان است (کارفرما نامِ نقش را می‌بیند) هم همین تصویر
 * می‌آید: عمومی است و چیزی از هویت لو نمی‌دهد.
 */
export function DefaultAvatar({
  fallback,
  className,
  style,
}: {
  fallback: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      src={DEFAULT_AVATAR_SRC}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('size-full bg-muted object-cover', className)}
      style={style}
    />
  );
}
