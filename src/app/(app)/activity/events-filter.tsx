'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import { useT } from '@/i18n/client';

/**
 * نوارِ فیلترِ «رویدادها» — جستجوی زنده و بازهٔ تاریخ (۲.۴.۰).
 *
 * ⚠️ فیلتر در **آدرس** می‌نشیند (همان قاعدهٔ دفترِ مالی): دکمهٔ برگشت کار
 * می‌کند، نتیجه قابلِ اشتراک است، و جستجو روی **همهٔ** رویدادها در سرور
 * انجام می‌شود — نه فقط ۵۰ ردیفِ صفحهٔ فعلی.
 * ⚠️ جستجو با ۳۵۰ میلی‌ثانیه درنگ می‌رود و با `replace`، نه `push`: هر حرف
 * یک ورودیِ تاریخچه نمی‌سازد.
 */
export function EventsFilter() {
  const tr = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get('q') ?? '');
  const first = useRef(true);

  const go = (changes: Record<string, string>, mode: 'push' | 'replace' = 'push') => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === '') next.delete(k);
      else next.set(k, v);
    }
    // هر تغییرِ فیلتر از صفحهٔ اول؛ وگرنه «صفحهٔ ۵» ِ نتیجهٔ قبلی خالی می‌افتاد.
    next.delete('page');
    const url = next.size ? `${pathname}?${next.toString()}` : pathname;
    startTransition(() => (mode === 'push' ? router.push(url) : router.replace(url)));
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const timer = setTimeout(() => {
      if (q.trim() !== (params.get('q') ?? '')) go({ q: q.trim() }, 'replace');
    }, 350);
    return () => clearTimeout(timer);
    // ⚠️ فقط با تایپ؛ `params` تغییرِ خودِ همین جستجو را هم می‌آورد.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const hasFilter = q !== '' || from !== '' || to !== '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tr('جستجو: نامِ شخص، پروژه، تسک یا نوعِ رویداد…')}
        aria-label={tr('جستجو در رویدادها')}
        containerClassName="sm:w-80"
      />
      <DatePicker
        size="sm" className="w-[9.5rem]" defaultValue={from} max={to || undefined}
        placeholder={tr('از تاریخ')} aria-label={tr('از تاریخ')}
        onChange={(v) => go({ from: v })}
      />
      <DatePicker
        size="sm" className="w-[9.5rem]" defaultValue={to} min={from || undefined}
        placeholder={tr('تا تاریخ')} aria-label={tr('تا تاریخ')}
        onChange={(v) => go({ to: v })}
      />
      {hasFilter && (
        <Button
          type="button" size="sm" variant="ghost" className="gap-1.5"
          onClick={() => { setQ(''); go({ q: '', from: '', to: '' }); }}
        >
          <X className="size-3.5" />
          {tr('پاک‌کردن')}
        </Button>
      )}
      {pending && <Spinner className="text-muted-foreground" />}
    </div>
  );
}
