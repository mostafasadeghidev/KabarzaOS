'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n/client';

export interface TaskFilterOptions {
  statuses: Array<{ id: number; name: string }>;
  priorities: Array<{ id: number; name: string }>;
  assignees: Array<{ id: number; name: string }>;
}

export interface TaskPaging {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/**
 * فیلترهای بردِ تسکِ تیم — پورتِ `tstatus` / `tassignee` / `tprio` / `tdue`.
 *
 * ⚠️ در آدرس می‌نشیند، نه state: مدیرِ دفتر معمولاً همین لینک را برای کسی
 * می‌فرستد («این‌ها را ببین»)، و state ِ کلاینت قابلِ اشتراک نیست.
 */
export function TaskFilter({
  options,
  paging,
}: {
  options: TaskFilterOptions;
  paging: TaskPaging;
}) {
  const tr = useT();
  const router = useRouter();
  const params = useSearchParams();

  const value = (key: string) => params.get(key) ?? '';
  const hasFilter = ['tstatus', 'tassignee', 'tprio', 'tdue'].some((k) => value(k) !== '');

  const go = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('tpage' in changes)) next.delete('tpage');
    router.push(`/team?${next.toString()}`);
  };

  const cell = 'h-9 rounded-md border bg-background px-2 text-sm';

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={value('tstatus')} className={cell}
          onChange={(e) => go({ tstatus: e.target.value })}
          aria-label={tr('وضعیت')}
        >
          <option value="">{tr('همهٔ وضعیت‌ها')}</option>
          {options.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select
          value={value('tassignee')} className={cell}
          onChange={(e) => go({ tassignee: e.target.value })}
          aria-label={tr('مسئول')}
        >
          <option value="">{tr('همهٔ مسئول‌ها')}</option>
          {/* ⚠️ صفر معنایش «بدونِ مسئول» است، نه «همه». */}
          <option value="0">{tr('بدونِ مسئول')}</option>
          {options.assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select
          value={value('tprio')} className={cell}
          onChange={(e) => go({ tprio: e.target.value })}
          aria-label={tr('اولویت')}
        >
          <option value="">{tr('همهٔ اولویت‌ها')}</option>
          {options.priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select
          value={value('tdue')} className={cell}
          onChange={(e) => go({ tdue: e.target.value })}
          aria-label={tr('ددلاین')}
        >
          <option value="">{tr('هر ددلاینی')}</option>
          <option value="overdue">{tr('گذشته')}</option>
          <option value="today">{tr('امروز')}</option>
          <option value="week">{tr('هفتهٔ آینده')}</option>
          <option value="none">{tr('بدونِ ددلاین')}</option>
        </select>

        {hasFilter && (
          <Button
            type="button" size="sm" variant="ghost" className="gap-1.5"
            onClick={() => go({ tstatus: '', tassignee: '', tprio: '', tdue: '' })}
          >
            <X className="size-3.5" />
            {tr('پاک‌کردن')}
          </Button>
        )}
      </div>

      {paging.totalPages > 1 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="num">
            {tr('{shown} از {total} ردیف', {
              shown: `${(paging.page - 1) * paging.perPage + 1}–${Math.min(paging.page * paging.perPage, paging.total)}`,
              total: paging.total,
            })}
          </span>
          <Button
            size="sm" variant="outline" className="h-7 px-2"
            disabled={paging.page <= 1}
            onClick={() => go({ tpage: String(paging.page - 1) })}
          >
            {tr('قبلی')}
          </Button>
          <span className="num">{paging.page} / {paging.totalPages}</span>
          <Button
            size="sm" variant="outline" className="h-7 px-2"
            disabled={paging.page >= paging.totalPages}
            onClick={() => go({ tpage: String(paging.page + 1) })}
          >
            {tr('بعدی')}
          </Button>
        </div>
      )}
    </div>
  );
}
