'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';

/**
 * صفحه‌بندی برای فهرست‌های **کارتی** — پروژه‌ها، اعضا، کارفرمایان.
 *
 * ⚠️ چرا نه `useTableView`: آن یکی جستجو را هم خودش می‌گیرد و روی جدول
 * سوار است. این فهرست‌ها جستجو و فیلترِ خودشان را دارند (تب، دفتر، وضعیت)،
 * پس فقط **بریدن** لازم است، نه یک لایهٔ فیلترِ دوم.
 *
 * ⚠️ چرا اصلاً لازم شد: کوئری‌های پروژه، افراد و جلسات هیچ `LIMIT` ندارند —
 * کلِ جدول می‌آید و کلِ آن رندر می‌شود. تا صد ردیف بی‌آزار است؛ بعد از آن
 * صفحه کند می‌شود بی‌آنکه کسی بفهمد چرا.
 *
 * ⚠️ صفحه در state می‌ماند نه در URL: برخلافِ دفترکل، اینجا فیلترها هم
 * state ِ محلی‌اند و نصفه‌کردنِ قرارداد بدتر از هر دو حالت است.
 */

const PER_PAGE = 24;

export function useCardPage<T>(rows: readonly T[], perPage = PER_PAGE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));

  /**
   * ⚠️ با عوض‌شدنِ فیلتر، تعدادِ صفحه‌ها کم می‌شود و «صفحهٔ ۵» دیگر وجود
   * ندارد — بدونِ این، کاربر به فهرستِ خالی می‌رسید و فکر می‌کرد نتیجه‌ای
   * نیست.
   */
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const slice = useMemo(
    () => rows.slice((page - 1) * perPage, page * perPage),
    [rows, page, perPage],
  );

  return { page, setPage, totalPages, total: rows.length, perPage, slice };
}

export function CardPager({
  page,
  setPage,
  totalPages,
  total,
  perPage,
}: {
  page: number;
  setPage: (n: number) => void;
  totalPages: number;
  total: number;
  perPage: number;
}) {
  const t = useT();
  if (totalPages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
      <span className="num">
        {t('{shown} از {total} ردیف', { shown: `${from}–${to}`, total })}
      </span>
      <Button
        size="sm" variant="outline" className="h-7 px-2"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        {t('قبلی')}
      </Button>
      <span className="num px-1">{page} / {totalPages}</span>
      <Button
        size="sm" variant="outline" className="h-7 px-2"
        disabled={page >= totalPages}
        onClick={() => setPage(page + 1)}
      >
        {t('بعدی')}
      </Button>
    </div>
  );
}
