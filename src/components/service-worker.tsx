'use client';

import { useEffect } from 'react';

/**
 * ثبتِ سرویس‌ورکرِ PWA (۲.۵۴.۰) — همین است که برنامه را «نصب‌شدنی» می‌کند.
 * ⚠️ فقط در تولید: در توسعه، سرویس‌ورکر ناوبری را می‌گیرد و بارگذاریِ داغ را گیج می‌کند.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
