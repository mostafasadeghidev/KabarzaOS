'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { useT } from '@/i18n/client';
import { monthRange, weekRange, yearRange } from '@/domain/reports/filters';
import { NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';

/**
 * نوارِ فیلترِ ریزِ ساعت — پورتِ `hours-filters.php`.
 *
 * ⚠️ پیش‌فرض‌ها **در کلاینت** ساخته می‌شوند چون به «امروزِ» کاربر بستگی
 * دارند، نه به ساعتِ سرور؛ ولی روزِ شروعِ هفته از **تنظیمات** می‌آید
 * (پیش از این «هفته» = هفت روزِ گذشته بود و با تبِ ساعت نمی‌خواند).
 *
 * ⚠️ «کل دوره» پارامترِ حاضر ولی خالی می‌فرستد (`from=&to=`): نبودِ پارامتر
 * یعنی «این هفته» (پورتِ افزونه)، پس پاک‌کردنِ پارامتر کافی نیست.
 */
export function HoursFilter({
  userId,
  projects,
  weekStart,
}: {
  userId: number;
  projects: Array<{ id: number; title: string }>;
  weekStart: number;
}) {
  const tr = useT();
  const router = useRouter();
  const params = useSearchParams();

  const value = (key: string) => params.get(key) ?? '';

  const go = (changes: Record<string, string>, keepEmpty = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' && !(keepEmpty && (k === 'from' || k === 'to'))) next.delete(k);
      else next.set(k, v);
    }
    router.push(`/reports/hours/${userId}?${next.toString()}`);
  };

  const today = new Date().toISOString().slice(0, 10);
  const presets = [
    { key: 'week', label: tr('این هفته'), ...weekRange(today, weekStart) },
    { key: 'month', label: tr('این ماه'), ...monthRange(today) },
    { key: 'year', label: tr('امسال'), ...yearRange(today) },
    { key: 'all', label: tr('کل دوره'), from: '', to: '' },
  ];
  const allTime = (params.has('from') || params.has('to')) && value('from') === '' && value('to') === '';
  const active = (p: { from: string; to: string }) =>
    p.from === '' ? allTime : value('from') === p.from && value('to') === p.to;


  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const from = String(data.get('from') ?? '');
        const to = String(data.get('to') ?? '');
        go({ from, to, project: String(data.get('project') ?? '') }, from === '' && to === '');
      }}
      className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3"
    >
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={active(p) ? 'default' : 'outline'}
            className="h-8"
            onClick={() => go({ from: p.from, to: p.to }, p.from === '')}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <Field>
        <FieldLabel htmlFor="hf-project" className="text-xs">{tr('پروژه')}</FieldLabel>
        <SearchableSelect id="hf-project" name="project" size="sm" containerClassName="w-44" defaultValue={value('project')}>
          <NativeSelectOption value="">{tr('همهٔ پروژه‌ها')}</NativeSelectOption>
          {projects.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.title}</NativeSelectOption>)}
        </SearchableSelect>
      </Field>

      <Field>
        <FieldLabel htmlFor="hf-from" className="text-xs">{tr('از')}</FieldLabel>
        <DatePicker id="hf-from" name="from" size="sm" className="w-[9.5rem]" defaultValue={value('from')} />
      </Field>
      <Field>
        <FieldLabel htmlFor="hf-to" className="text-xs">{tr('تا')}</FieldLabel>
        <DatePicker id="hf-to" name="to" size="sm" className="w-[9.5rem]" defaultValue={value('to')} />
      </Field>

      <Button type="submit" size="sm">{tr('اعمال')}</Button>
    </form>
  );
}
