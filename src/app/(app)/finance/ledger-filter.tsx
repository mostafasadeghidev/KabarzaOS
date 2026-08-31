'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n/client';

export interface LedgerPaging {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface FilterOptions {
  categories: Array<{ id: number; name: string }>;
  projects: Array<{ id: number; title: string }>;
}

/**
 * نوارِ فیلترِ دفتر — پورتِ `templates/admin/accounting/filter.php`.
 *
 * ⚠️ فیلترها در **آدرس** می‌نشینند، نه در state: دکمهٔ برگشتِ مرورگر کار
 * می‌کند، لینکِ نتیجه قابلِ اشتراک است، و خروجیِ CSV می‌تواند دقیقاً همان
 * فیلتر را بگیرد.
 */
export function LedgerFilter({
  accountId,
  options,
  paging,
}: {
  accountId: number;
  options: FilterOptions;
  paging: LedgerPaging;
}) {
  const tr = useT();
  const router = useRouter();
  const params = useSearchParams();

  const value = (key: string) => params.get(key) ?? '';
  const hasFilter = ['from', 'to', 'tag', 'project', 'party'].some((k) => value(k) !== '');

  const go = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    next.set('account', String(accountId));
    for (const [k, v] of Object.entries(changes)) {
      if (v === '') next.delete(k);
      else next.set(k, v);
    }
    // ⚠️ هر تغییرِ فیلتر به صفحهٔ اول برمی‌گردد، وگرنه «صفحهٔ ۵» ِ نتیجهٔ
    // قبلی روی نتیجهٔ تازه می‌افتاد و کاربر جدولِ خالی می‌دید.
    if (!('page' in changes)) next.delete('page');
    router.push(`/finance?${next.toString()}`);
  };

  const submit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    go({
      from: String(data.get('from') ?? ''),
      to: String(data.get('to') ?? ''),
      tag: String(data.get('tag') ?? ''),
      project: String(data.get('project') ?? ''),
      party: String(data.get('party') ?? '').trim(),
    });
  };

  const cell = 'h-9 rounded-md border bg-background px-2 text-sm';

  return (
    <div className="grid gap-2">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}
        className="flex flex-wrap items-end gap-2 rounded-md border p-3"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="lf-from" className="text-xs">{tr('از تاریخ')}</Label>
          <Input id="lf-from" name="from" type="date" className="num h-9 w-[9.5rem]" defaultValue={value('from')} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lf-to" className="text-xs">{tr('تا تاریخ')}</Label>
          <Input id="lf-to" name="to" type="date" className="num h-9 w-[9.5rem]" defaultValue={value('to')} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lf-tag" className="text-xs">{tr('دسته')}</Label>
          <select id="lf-tag" name="tag" defaultValue={value('tag')} className={cell}>
            <option value="">{tr('همه')}</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lf-project" className="text-xs">{tr('پروژه')}</Label>
          <select id="lf-project" name="project" defaultValue={value('project')} className={cell}>
            <option value="">{tr('همه')}</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lf-party" className="text-xs">{tr('طرف‌حساب')}</Label>
          <Input
            id="lf-party" name="party" defaultValue={value('party')}
            placeholder={tr('نامِ پرداخت‌کننده یا گیرنده')} className="h-9 w-52"
          />
        </div>

        <Button type="submit" size="sm" className="gap-1.5">
          <Search className="size-3.5" />
          {tr('جستجو')}
        </Button>

        {hasFilter && (
          <Button
            type="button" size="sm" variant="ghost" className="gap-1.5"
            onClick={() => go({ from: '', to: '', tag: '', project: '', party: '' })}
          >
            <X className="size-3.5" />
            {tr('پاک‌کردن')}
          </Button>
        )}

        <a
          href={`/finance/export?${params.toString()}&account=${accountId}`}
          className="ms-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {tr('خروجی CSV')}
        </a>
      </form>

      {paging.totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="num">
            {tr('{shown} از {total} ردیف', {
              shown: `${(paging.page - 1) * paging.perPage + 1}–${Math.min(paging.page * paging.perPage, paging.total)}`,
              total: paging.total,
            })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm" variant="outline" className="h-7 px-2"
              disabled={paging.page <= 1}
              onClick={() => go({ page: String(paging.page - 1) })}
            >
              {tr('قبلی')}
            </Button>
            <span className="num px-1">{paging.page} / {paging.totalPages}</span>
            <Button
              size="sm" variant="outline" className="h-7 px-2"
              disabled={paging.page >= paging.totalPages}
              onClick={() => go({ page: String(paging.page + 1) })}
            >
              {tr('بعدی')}
            </Button>
          </div>
          <select
            value={String(paging.perPage)}
            onChange={(e) => go({ per: e.target.value, page: '1' })}
            className="h-7 rounded-md border bg-background px-1 text-xs"
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
