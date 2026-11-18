'use client';

import { useEffect, useState } from 'react';

/**
 * دستگاهِ لمسی بی ماوس/کیبوردِ سخت‌افزاری (گوشی، تبلت) — ۳.۱۷.۲.
 * برای پنهان کردنِ راهنماهایی مثلِ «Ctrl+V» یا «رها کنید» که روی گوشی معنا ندارند.
 * ⚠️ پس از mount خوانده می‌شود (اول false) تا رندرِ سرور و مرورگر یکی باشد.
 */
export function useTouchOnly(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(hover: none) and (pointer: coarse)');
    if (!mq) return;
    setTouch(mq.matches);
    const on = () => setTouch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return touch;
}
