'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * پلِ بینِ سرصفحهٔ صفحه و نوارِ بالای محتوا.
 *
 * ⚠️ چرا یک مخزنِ کوچک و نه پراپ: `PageHeader` داخلِ **صفحه** رندر می‌شود و
 * نوارِ بالا داخلِ **چیدمان** — دو درختِ جدا که پراپ بینشان رد نمی‌شود.
 * `PageHeader` عنوانش را این‌جا ثبت می‌کند و `HeaderBreadcrumb` آن را
 * می‌خواند تا مسیرِ «پروژه‌ها › نامِ پروژه» بسازد.
 *
 * ⚠️ فقط عنوانِ **رشته‌ای** ثبت می‌شود: عنوانِ JSX (نام + نشان) در مسیر جا
 * نمی‌گیرد و همان بخشِ منو تنها می‌ماند.
 *
 * ⚠️ `useSyncExternalStore` با تصویرِ سرورِ `null`: در رندرِ سرور و آبرسانی
 * مسیر فقط بخشِ منو را دارد و بعد از mount ِ صفحه عنوان اضافه می‌شود؛
 * وگرنه HTML ِ سرور و کلاینت ناهمگام می‌شد.
 */
export interface PageCrumbData {
  title: string;
  back?: { href: string; label: string };
}

let current: PageCrumbData | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function set(next: PageCrumbData | null) {
  current = next;
  for (const l of listeners) l();
}

export function usePageCrumb(): PageCrumbData | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** بی‌رندر — فقط ثبت می‌کند. داخلِ `PageHeader` می‌نشیند. */
export function PageCrumb({
  title,
  backHref,
  backLabel,
}: {
  title?: string;
  backHref?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    if (!title) { set(null); return; }
    set({ title, back: backHref && backLabel ? { href: backHref, label: backLabel } : undefined });
    return () => set(null);
  }, [title, backHref, backLabel]);
  return null;
}
