'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveEvents } from '@/components/live';

/**
 * نبضِ زنده — شمارِ اعلان و پیامِ خوانده‌نشده را بدونِ بارگذاریِ دوبارهٔ صفحه
 * تازه نگه می‌دارد. پورتِ لایهٔ.
 *
 * ⚠️ وقتی تب **دیده نمی‌شود** نبض متوقف می‌شود. بدونِ این، ده تبِ بازِ فراموش‌شده
 * تا ابد به سرور می‌کوبند — و کاربری که نگاه نمی‌کند، به‌روزرسانی هم نمی‌خواهد.
 * برگشتن به تب بی‌درنگ یک نبض می‌زند تا عددِ کهنه نماند.
 */
export function usePulse(intervalSeconds: number, enabled: boolean) {
  const [counts, setCounts] = useState<{ notif: number; msg: number; mail: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const beatRef = useRef<() => void>(() => {});
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * ۳.۱۴.۰ — خبرِ لحظه‌ای: عددها همان لحظه تازه می‌شوند (کمی صبر تا چند خبرِ پشتِ‌سرِهم یکی شوند).
   * تا خط برقرار است، پرسیدنِ دوره‌ای فقط پشتیبان است — هر ۵ دقیقه.
   */
  const live = useLiveEvents(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => beatRef.current(), 400);
  });
  const seconds = live ? 300 : intervalSeconds > 0 ? intervalSeconds : 45;

  useEffect(() => {
    if (!enabled) return;

    let alive = true;
    const beat = () => {
      // ⚠️ تبِ پنهان نبض نمی‌زند.
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/pulse')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { notif: number; msg: number; mail?: number } | null) => {
          if (alive && data) setCounts({ notif: data.notif, msg: data.msg, mail: data.mail ?? 0 });
        })
        .catch(() => {
          // شکستِ نبض بی‌اهمیت است؛ عددِ فعلی سرِ جایش می‌ماند.
        });
    };

    beatRef.current = beat;
    beat();
    timer.current = setInterval(beat, seconds * 1000);

    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [seconds, enabled]);

  return counts;
}

/**
 * نشانِ عددیِ زنده.
 *
 * ⚠️ عددِ اولیه از **سرور** می‌آید و تا رسیدنِ اولین نبض همان نشان داده
 * می‌شود؛ وگرنه هر بار بارگذاریِ صفحه یک پرشِ «۰ ← عدد» دیده می‌شد.
 */
export function LiveCount({
  initial,
  live,
  max = 99,
  className = '',
}: {
  initial: number;
  live: number | null;
  /**
   * ⚠️ سقف **پارامتر** است، نه ثابت، و این عمدی است: بجِ زنگ یک دایرهٔ
   * کوچکِ مطلق است و بیش از یک رقم در آن نمی‌نشیند (۹+)، ولی بجِ سایدبار
   * جا دارد (۹۹+). یکی‌کردنِ سقف، یکی از دو چیدمان را می‌شکست.
   */
  max?: number;
  className?: string;
}) {
  const value = live ?? initial;
  if (value <= 0) return null;
  return (
    <span className={`num ${className}`}>
      {value > max ? `${toPersianDigits(max)}+` : value}
    </span>
  );
}

/** ⚠️ سقف با رقمِ فارسی نوشته می‌شود تا کنارِ بقیهٔ اعداد یکدست بماند. */
function toPersianDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
}
