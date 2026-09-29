'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CircleAlert, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';

/** برچسبِ هر بخشِ فرمِ ساخت. */
const STEP_LABELS: Record<string, string> = {
  members: 'اعضا',
  clients: 'کارفرمایان',
  tasks: 'تسک‌ها',
  qa: 'چک‌لیستِ QA',
  links: 'لینک‌ها',
  attachments: 'فایل‌ها',
  thumbnail: 'تصویرِ شاخص',
};

/**
 * پس از ساختِ پروژه — «پروژه ساخته شد.» (F#23) و، اگر بخشی از فرمِ ساخت ثبت
 * نشد، هشداری که می‌ماند تا بسته شود (F#81). ⚠️ پارامترها بلافاصله از نشانی
 * پاک می‌شوند تا رفرش یا اشتراکِ لینک پیام را تکرار نکند؛ هشدار از state
 * خوانده می‌شود، نه از نشانی.
 */
export function CreatedNotice({ created, incomplete }: { created: boolean; incomplete: string[] }) {
  const tr = useT();
  const { show } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [missing, setMissing] = useState(incomplete);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || (!created && incomplete.length === 0)) return;
    done.current = true;
    if (created) show(tr('پروژه ساخته شد.'), 'success');
    const next = new URLSearchParams(params.toString());
    next.delete('created');
    next.delete('incomplete');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [created, incomplete, params, pathname, router, show, tr]);

  if (missing.length === 0) return null;
  return (
    <Alert variant="warning">
      <CircleAlert />
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          {tr('پروژه ساخته شد، ولی این بخش‌ها ثبت نشدند؛ از تب‌های خودشان دوباره اضافه کنید: {parts}', {
            parts: missing.map((m) => tr(STEP_LABELS[m] ?? m)).join('، '),
          })}
        </span>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={tr('بستن')} onClick={() => setMissing([])}>
          <X />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
