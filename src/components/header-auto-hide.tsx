'use client';

import { useEffect } from 'react';

/**
 * نوارِ بالای چسبان (۳.۱۷.۰) — `data-stuck` وقتی صفحه پیمایش شده (همهٔ اندازه‌ها)، و روی گوشی — مثلِ Safari/Chrome ِ گوشی: با پیمایش به پایین کنار می‌رود تا
 * صفحهٔ کوچک برای محتوا بماند، و با کمی پیمایش به بالا فوراً برمی‌گردد. روی رایانه همیشه پیداست.
 *
 * ⚠️ فقط ویژگیِ `data-hidden` روی خودِ نوار گذاشته می‌شود؛ حرکت و جای نوارِ تایمر در visual-layer.css است.
 * نزدیکِ بالای صفحه (۸۰ پیکسلِ اول) و هنگامِ باز بودنِ منو/پنجره همیشه پیداست.
 */
export function HeaderAutoHide() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-slot='sidebar-inset'] > header[data-app-chrome]");
    if (!header) return;
    const phone = window.matchMedia('(max-width: 767px)');
    let last = window.scrollY;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const delta = y - last;
      const menuOpen = header.querySelector('[aria-expanded="true"]') !== null;
      // چسبیده به لبهٔ بالا (همهٔ اندازه‌ها) — گوشه‌های بالا صاف می‌شوند (visual-layer.css).
      if (y > 4) header.setAttribute('data-stuck', ''); else header.removeAttribute('data-stuck');
      if (!phone.matches || y < 80 || menuOpen) header.removeAttribute('data-hidden');
      else if (delta > 6) header.setAttribute('data-hidden', '');
      else if (delta < -6) header.removeAttribute('data-hidden');
      if (Math.abs(delta) > 6 || y < 80) last = y;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    phone.addEventListener('change', update);
    return () => {
      window.removeEventListener('scroll', onScroll);
      phone.removeEventListener('change', update);
      if (raf) cancelAnimationFrame(raf);
      header.removeAttribute('data-hidden');
      header.removeAttribute('data-stuck');
    };
  }, []);
  return null;
}
