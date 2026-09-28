'use client';

import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/client';
import { ltr } from '@/i18n/bidi';
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink,
} from '@/components/ui/pagination';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/**
 * صفحه‌بندِ مشترکِ اپ — روی `Pagination` ِ shadcn.
 *
 * ⚠️ چرا لازم شد: شش صفحه‌بندِ متفاوت داشتیم — جدول‌ها و کارت‌ها («قبلی/بعدی»
 * با شمارندهٔ «۱ / ۵»)، دفترِ کل (همان + انتخابِ تعداد در صفحه)، تسک‌های
 * تیم، صفحهٔ فعالیت («تازه‌تر/قدیمی‌تر» با متنِ دیگر) و ساعتِ کاری (شمارهٔ
 * همهٔ صفحه‌ها کنارِ هم). کارشان یکی بود و ظاهرشان نه. حالا یکی است:
 * «{shown} از {total} ردیف» + قبلی، شماره‌ها (با «…»)، بعدی.
 *
 * دو حالت، بسته به این‌که صفحه کجا نگه داشته می‌شود:
 *   `onPage`  — state ِ کلاینت (جدول‌های از‌پیش‌لودشده، فهرست‌های کارتی).
 *   `hrefOf`  — صفحه در **آدرس** است (دفترِ کل، فعالیت، ساعتِ کاری)؛ هر
 *               شماره یک `<Link>` است تا برگشتِ مرورگر و اشتراکِ لینک کار کند.
 *
 * `label` — متنِ شمارش را عوض می‌کند (ساعتِ کاری «{n} ثبت» می‌گوید).
 * `perPageOptions` + `onPerPage` — انتخابِ تعداد در صفحه (فقط دفترِ کل).
 *
 * ⚠️ قبلی/بعدی با `PaginationLink asChild` ساخته می‌شوند، نه
 * `PaginationPrevious`: آن دو خودشان آیکون و متن را به‌عنوانِ فرزند می‌گذارند
 * و با `asChild` دو فرزند به Slot می‌رسد — «Slot failed to slot» و صفحهٔ
 * ساعتِ کاری سفید می‌شد (دیده شد). پس آیکون و متن این‌جا داخلِ خودِ
 * پیوند/دکمه می‌نشینند.
 */
export interface PagerProps {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPage?: (page: number) => void;
  hrefOf?: (page: number) => string;
  label?: string;
  perPageOptions?: readonly number[];
  onPerPage?: (perPage: number) => void;
  className?: string;
}

/** شماره‌های دیدنی: همه تا ۷ صفحه؛ بیشتر → اول، دورِ صفحهٔ جاری، آخر، با «…». */
export function pageItems(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, 'gap', totalPages];
  if (page >= totalPages - 3) {
    return [1, 'gap', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'gap', page - 1, page, page + 1, 'gap', totalPages];
}

export function Pager({
  page, totalPages, total, perPage, onPage, hrefOf, label, perPageOptions, onPerPage, className,
}: PagerProps) {
  const tr = useT();
  if (total === 0 || (totalPages <= 1 && !perPageOptions)) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const text = label ?? tr('{shown} از {total} ردیف', { shown: ltr(`${from}–${to}`), total });

  // یک عنصر برای هر دو حالت: پیوند (آدرس) یا دکمه (state).
  const go = (target: number, kind: 'prev' | 'next' | 'page', disabled = false) => {
    const word = kind === 'prev' ? tr('قبلی') : kind === 'next' ? tr('بعدی') : tr('صفحهٔ {n}', { n: target });
    const inner = kind === 'prev'
      ? <><ChevronLeftIcon className="rtl:rotate-180" /><span className="hidden sm:block">{word}</span></>
      : kind === 'next'
        ? <><span className="hidden sm:block">{word}</span><ChevronRightIcon className="rtl:rotate-180" /></>
        : <span className="num">{target}</span>;
    const common = {
      size: kind === 'page' ? 'icon-sm' as const : 'sm' as const,
      isActive: kind === 'page' && target === page,
      className: kind === 'page' ? undefined : 'gap-1 px-2.5',
      'aria-label': word,
    };
    if (hrefOf && !disabled) {
      return (
        <PaginationLink asChild {...common}>
          <Link href={hrefOf(target)} prefetch={false}>{inner}</Link>
        </PaginationLink>
      );
    }
    return (
      <PaginationLink asChild {...common}>
        <button type="button" disabled={disabled} onClick={() => onPage?.(target)}>{inner}</button>
      </PaginationLink>
    );
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground', className)}>
      <span className="tabular-nums">{text}</span>

      {totalPages > 1 && (
        <Pagination className="mx-0 w-auto" aria-label={tr('صفحه‌ها')}>
          <PaginationContent>
            <PaginationItem>{go(page - 1, 'prev', page <= 1)}</PaginationItem>
            {pageItems(page, totalPages).map((item, i) => (
              <PaginationItem key={item === 'gap' ? `gap-${i}` : item}>
                {item === 'gap' ? <PaginationEllipsis className="size-8" /> : go(item, 'page')}
              </PaginationItem>
            ))}
            <PaginationItem>{go(page + 1, 'next', page >= totalPages)}</PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {perPageOptions && onPerPage && (
        <NativeSelect
          value={String(perPage)}
          onChange={(e) => onPerPage(Number(e.target.value))}
          size="sm"
          className="h-8 text-xs"
          aria-label={tr('تعداد در صفحه')}
        >
          {perPageOptions.map((n) => (
            <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </div>
  );
}
