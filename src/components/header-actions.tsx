'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * دکمهٔ اصلیِ صفحه در نوارِ بالا، کنارِ جستجو و اعلان‌ها (۲.۳۸.۰).
 *
 * ⚠️ چرا پورتال: نوارِ بالا در **چیدمان** است و دکمه در **صفحه** — و دکمه
 * باید همان کامپوننتِ صفحه بماند (دیالوگ و stateِ خودش را باز می‌کند). با
 * پورتال، درختِ React همان درختِ صفحه است و فقط جای DOM عوض می‌شود.
 *
 * ⚠️ فقط کارِ اصلیِ صفحه («پروژهٔ جدید»، «جلسهٔ جدید»، «افزودنِ عضو»…) اینجا
 * می‌آید؛ جستجو و فیلتر روی خودِ صفحه می‌مانند.
 */

const SLOT_ID = 'app-header-actions';

/**
 * جای دکمه‌ها در نوارِ بالا.
 * ⚠️ `shrink-0` و `whitespace-nowrap`: دکمهٔ بلند (آلمانی، فرانسوی) نوار را
 * دو خط نمی‌کند و جستجو و اعلان را از جایشان هل نمی‌دهد — فقط مسیرِ صفحه
 * (breadcrumb) که `min-w-0` است کوتاه‌تر می‌شود.
 * ⚠️ روی صفحهٔ باریک فقط آیکون می‌ماند: متن با اندازهٔ صفر پنهان می‌شود ولی
 * برای صفحه‌خوان سرِ جایش است.
 */
export function HeaderActionsSlot() {
  return (
    <div
      id={SLOT_ID}
      className={cn(
        'flex shrink-0 items-center gap-2 whitespace-nowrap empty:hidden',
        // ⚠️ فرزندِ مستقیم، نه `data-slot=button`: دکمه‌ای که با `asChild` ماشهٔ دیالوگ است
        // `data-slot` ِ خودش را می‌گیرد. هم‌قدِ جستجو (h-8) تا نوار یک‌دست بماند.
        '[&>*]:h-8 max-sm:[&>*]:gap-0 max-sm:[&>*]:px-2 max-sm:[&>*]:text-[0px]',
      )}
    />
  );
}

export function HeaderAction({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById(SLOT_ID)); }, []);
  if (!slot || !children) return null;
  return createPortal(children, slot);
}
