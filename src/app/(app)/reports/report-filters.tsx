'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { useT } from '@/i18n/client';
import { isPresetActive, reportQuery, type RangePreset } from '@/domain/reports/filters';

/**
 * فیلترهای صفحهٔ گزارش‌ها — پورتِ `office_filter_html` و نوارِ بازهٔ
 * تب‌های «هزینه‌ها» / «ساعت کاری» ِ افزونه.
 *
 * ⚠️ فرمِ GET ِ ساده، نه state: صفحه با پارامترها دوباره از سرور رندر می‌شود
 * تا **جمع‌های کارت‌ها** هم با همان فیلتر حساب شوند، نه فقط جدول.
 */

export interface OfficeOption { id: number; name: string }

export function OfficeFilter({
  tab,
  offices,
  selected,
  extra = {},
}: {
  tab: string;
  offices: OfficeOption[];
  selected: number[];
  /** پارامترهای دیگری که باید حفظ شوند (بازهٔ تاریخ). */
  extra?: Record<string, string>;
}) {
  const tr = useT();
  const clearHref = `/reports?${new URLSearchParams({ tab, ...extra }).toString()}`;
  return (
    <form method="get" action="/reports" className="flex flex-wrap items-end gap-2 rounded-md border p-3">
      <input type="hidden" name="tab" value={tab} />
      {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="grid min-w-[14rem] gap-1.5">
        <span className="text-xs text-muted-foreground">{tr('دفتر:')}</span>
        <MultiSelect
          name="office"
          options={offices.map((o) => ({ id: o.id, label: o.name }))}
          defaultSelected={selected}
          placeholder={tr('همهٔ دفاتر')}
        />
      </div>
      <Button type="submit" size="sm">{tr('اعمال')}</Button>
      {selected.length > 0 && (
        <Link href={clearHref} className="text-xs text-muted-foreground underline">{tr('همهٔ دفاتر')}</Link>
      )}
    </form>
  );
}

/**
 * نوارِ بازه: پیش‌تنظیم‌ها (پیوندِ ساده) + از/تا دستی.
 * تبِ ساعت پارامترهای `hfrom/hto` دارد تا با بازهٔ هزینه‌ها قاطی نشود؛
 * «کل دوره» پارامترِ **حاضر ولی خالی** می‌فرستد (پورتِ افزونه).
 */
export function RangeBar({
  tab,
  presets,
  range,
  officeIds,
  hours = false,
}: {
  tab: string;
  presets: RangePreset[];
  range: { from: string; to: string };
  officeIds: number[];
  hours?: boolean;
}) {
  const tr = useT();
  const fromName = hours ? 'hfrom' : 'from';
  const toName = hours ? 'hto' : 'to';
  const link = (p: RangePreset) => `/reports?${reportQuery(
    hours
      ? { tab, office: officeIds, hfrom: p.from, hto: p.to, hoursAllTime: p.from === '' && p.to === '' }
      : { tab, office: officeIds, from: p.from, to: p.to },
  )}`;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <Button
            key={p.key}
            asChild
            size="sm"
            variant={isPresetActive(p, range) ? 'default' : 'outline'}
            className="h-8"
          >
            <Link href={link(p)}>{tr(p.label)}</Link>
          </Button>
        ))}
      </div>
      <form method="get" action="/reports" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={tab} />
        {officeIds.map((id) => <input key={id} type="hidden" name="office" value={id} />)}
        <label className="grid gap-1 text-xs text-muted-foreground">
          {tr('از')}
          <Input type="date" name={fromName} defaultValue={range.from} className="num h-8 w-[9.5rem]" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          {tr('تا')}
          <Input type="date" name={toName} defaultValue={range.to} className="num h-8 w-[9.5rem]" />
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-8">{tr('اعمال')}</Button>
      </form>
    </div>
  );
}
