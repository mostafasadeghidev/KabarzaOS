'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Combobox } from '@/components/ui/combobox';
import { useT } from '@/i18n/client';
import { NativeSelectOption } from '@/components/ui/native-select';
import { Pager } from '@/components/ui/pager';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';

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

  /**
   * ⚠️ state ِ محلی چون Combobox کنترل‌شده است. مقدارِ اولیه از **آدرس**
   * می‌آید تا لینکِ فیلترشده و دکمهٔ برگشتِ مرورگر کار کند (همان قاعده‌ای
   * که بقیهٔ فیلترها دارند).
   */
  const initialProject = (() => {
    const id = Number(params.get('project')) || null;
    const found = id ? options.projects.find((p) => p.id === id) : null;
    return { id: found?.id ?? null, label: found?.title ?? '' };
  })();
  const [project, setProject] = useState(initialProject);
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


  return (
    <div className="grid gap-2">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}
        className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3"
      >
        <Field>
          <FieldLabel htmlFor="lf-from" className="text-xs">{tr('از تاریخ')}</FieldLabel>
          <DatePicker id="lf-from" name="from" size="sm" className="w-[9.5rem]" defaultValue={value('from')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="lf-to" className="text-xs">{tr('تا تاریخ')}</FieldLabel>
          <DatePicker id="lf-to" name="to" size="sm" className="w-[9.5rem]" defaultValue={value('to')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="lf-tag" className="text-xs">{tr('دسته')}</FieldLabel>
          <SearchableSelect id="lf-tag" name="tag" size="sm" containerClassName="w-40" defaultValue={value('tag')}>
            <NativeSelectOption value="">{tr('همه')}</NativeSelectOption>
            {options.categories.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>
            ))}
          </SearchableSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="lf-project" className="text-xs">{tr('پروژه')}</FieldLabel>
          {/*
            ⚠️ جستجوی زنده، نه فهرستِ بازشونده: فهرست همهٔ پروژه‌ها را
            می‌آورد و روی یک آژانسِ چندساله می‌شود صدها ردیف که پیداکردنِ
            یکی در آن از تایپ‌کردنِ نامش کندتر است.
          */}
          <Combobox
            id="lf-project"
            name="project"
            size="sm"
            options={options.projects.map((p) => ({ value: p.id, label: p.title }))}
            value={project}
            onChange={setProject}
            placeholder={tr('همه')}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="lf-party" className="text-xs">{tr('طرف‌حساب')}</FieldLabel>
          <Input
            id="lf-party" name="party" defaultValue={value('party')}
            placeholder={tr('نامِ پرداخت‌کننده یا گیرنده')} className="h-8 w-52"
          />
        </Field>

        <Button type="submit" size="sm" className="gap-1.5">
          <Search className="size-3.5" />
          {tr('جستجو')}
        </Button>

        {hasFilter && (
          <Button
            type="button" size="sm" variant="ghost" className="gap-1.5"
            onClick={() => {
              setProject({ id: null, label: '' });
              go({ from: '', to: '', tag: '', project: '', party: '' });
            }}
          >
            <X className="size-3.5" />
            {tr('پاک‌کردن')}
          </Button>
        )}

        <Button asChild size="sm" variant="outline" className="ms-auto">
          <a href={`/finance/export?${params.toString()}&account=${accountId}`}>
            <Download />
            {tr('خروجی CSV')}
          </a>
        </Button>
      </form>

      {/* صفحه در آدرس است (go)، پس `onPage` همان `router.push` را می‌زند؛ تعداد در صفحه هم همین‌جا. */}
      <Pager
        page={paging.page}
        totalPages={paging.totalPages}
        total={paging.total}
        perPage={paging.perPage}
        onPage={(p) => go({ page: String(p) })}
        perPageOptions={[25, 50, 100, 200]}
        onPerPage={(n) => go({ per: String(n), page: '1' })}
      />
    </div>
  );
}
