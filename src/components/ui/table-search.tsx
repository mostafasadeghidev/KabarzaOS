'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n/client';

/**
 * جستجوی زنده + صفحه‌بندیِ کلاینتیِ جدول.
 * (`data-kt-page` / `data-kt-search`).
 *
 * ⚠️ چرا کلاینتی و نه سرور: نسخهٔ قبلی هم همین کار را می‌کند و دلیلش کاربردی
 * است — این جدول‌ها **از قبل کاملاً لود شده‌اند** (گزارشِ ۲۰۰ ردیفی)، پس
 * رفت‌وبرگشتِ سرور برای هر حرف فقط کندی اضافه می‌کند. جایی که داده بریده
 * می‌شود (دفترِ حسابداری) فیلترِ سرور داریم، نه این.
 *
 * ⚠️ فیلترِ سرور و این با هم می‌نشینند و تضاد ندارند: آن دامنه را باریک
 * می‌کند، این داخلِ همان دامنه می‌گردد.
 */

const DEFAULT_PER_PAGE = 20;

export interface TableView<T> {
  query: string;
  setQuery: (value: string) => void;
  /** ردیف‌های صفحهٔ جاری. */
  rows: T[];
  /** شمارِ کلِ ردیف‌های **منطبق**، نه کلِ ردیف‌ها. */
  matched: number;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  perPage: number;
}

export function useTableView<T>(
  all: readonly T[],
  searchOf: (row: T) => string,
  perPage = DEFAULT_PER_PAGE,
): TableView<T> {
  const [query, setQueryRaw] = useState('');
  const [page, setPage] = useState(1);

  const matched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return [...all];
    return all.filter((row) => searchOf(row).toLowerCase().includes(needle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, query]);

  const totalPages = Math.max(1, Math.ceil(matched.length / perPage));
  // ⚠️ صفحهٔ بیرون از بازه به آخرین صفحه می‌چسبد، نه به جدولِ خالی: بعد از
  // جستجو تعدادِ صفحه‌ها کم می‌شود و «صفحهٔ ۵» دیگر وجود ندارد.
  const safePage = Math.min(page, totalPages);

  return {
    query,
    setQuery: (value: string) => { setQueryRaw(value); setPage(1); },
    rows: matched.slice((safePage - 1) * perPage, safePage * perPage),
    matched: matched.length,
    page: safePage,
    setPage,
    totalPages,
    perPage,
  };
}

export function TableSearch({
  view,
  placeholder,
}: {
  view: TableView<unknown>;
  placeholder?: string;
}) {
  const tr = useT();
  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute inset-inline-start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={view.query}
        onChange={(e) => view.setQuery(e.target.value)}
        placeholder={placeholder ?? tr('جستجوی زنده')}
        className="h-9 ps-8"
      />
    </div>
  );
}

export function TablePager({ view }: { view: TableView<unknown> }) {
  const tr = useT();
  if (view.totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="num">
        {tr('{shown} از {total} ردیف', {
          shown: `${(view.page - 1) * view.perPage + 1}–${Math.min(view.page * view.perPage, view.matched)}`,
          total: view.matched,
        })}
      </span>
      <Button
        size="sm" variant="outline" className="h-7 px-2"
        disabled={view.page <= 1}
        onClick={() => view.setPage(view.page - 1)}
      >
        {tr('قبلی')}
      </Button>
      <span className="num px-1">{view.page} / {view.totalPages}</span>
      <Button
        size="sm" variant="outline" className="h-7 px-2"
        disabled={view.page >= view.totalPages}
        onClick={() => view.setPage(view.page + 1)}
      >
        {tr('بعدی')}
      </Button>
    </div>
  );
}
