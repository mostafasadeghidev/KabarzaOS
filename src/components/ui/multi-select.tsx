'use client';

import { useMemo, useState } from 'react';
import { MultiSelect as SearchableMultiSelect } from '@/components/ui/combobox';

/**
 * انتخابِ چندتایی — فیلدی که با کلیک باز می‌شود.
 *
 * ⚠️ چرا نه ردیفی از چک‌باکس‌ها: با ده نقش و چند دفتر، فرم چند سطر بلندتر
 * می‌شد و انتخاب‌شده‌ها بینِ انتخاب‌نشده‌ها گم بودند. اینجا فیلد فقط
 * انتخاب‌شده‌ها را نشان می‌دهد و فهرست وقتی باز می‌شود که لازم باشد.
 *
 * ⚠️ فقط یک پوستهٔ **کنترل‌نشده** روی `MultiSelect` ِ combobox.tsx است (همان
 * Popover + Command). پیش از این فهرستِ دست‌سازِ جدایی داشت که نه جستجو داشت
 * و نه مثلِ بقیهٔ انتخابگرها باز می‌شد. امضا همان است: `defaultSelected` و
 * گزینه‌هایی با `id`.
 *
 * ⚠️ مقدارها به‌صورتِ `<input type="hidden">` می‌روند، نه state ِ فرم:
 * این جزء داخلِ فرم‌های server action استفاده می‌شود و `FormData` باید
 * بدونِ جاوااسکریپتِ اضافی پرشان کند.
 */

export interface MultiOption {
  id: number;
  label: string;
  /** نقطهٔ رنگی کنارِ گزینه — برای تگ‌ها. */
  color?: string;
}

export function MultiSelect({
  name,
  options,
  defaultSelected = [],
  placeholder,
  emptyText,
  onChange,
  size = 'default',
}: {
  name: string;
  options: MultiOption[];
  defaultSelected?: number[];
  placeholder: string;
  emptyText?: string;
  /** برای فیلدهایی که به انتخابِ این یکی وابسته‌اند (مثلِ «مدیرِ این دفاتر»). */
  onChange?: (selected: number[]) => void;
  /** `sm` در نوارِ فیلتر — هم‌قدِ بقیهٔ کنترل‌های `sm` (۳۲ پیکسل). */
  size?: 'sm' | 'default';
}) {
  const [selected, setSelected] = useState<number[]>(defaultSelected);
  const mapped = useMemo(
    () => options.map((o) => ({ value: o.id, label: o.label, color: o.color })),
    [options],
  );

  return (
    <SearchableMultiSelect
      name={name}
      options={mapped}
      selected={selected}
      onChange={(next) => { setSelected(next); onChange?.(next); }}
      placeholder={placeholder}
      emptyText={emptyText}
      size={size}
    />
  );
}
