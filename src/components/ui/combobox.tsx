'use client';

/**
 * انتخابگرهای جستجودار — تک‌مقداری (`Combobox`) و چندمقداری (`MultiSelect`).
 *
 * ⚠️ روی همان الگوی Combobox ِ shadcn سوارند که `SearchableSelect`: Popover +
 * Command. پیش از این هر کدام فهرستِ دست‌سازِ خودشان را داشتند (portal و
 * مختصاتِ fixed ِ دستی، کلیدهای جهت‌دارِ دستی)؛ در یک دیالوگ سه انتخابگر کنارِ
 * هم بودند که هر کدام جای دیگری باز می‌شد و با کیبورد جورِ دیگری کار می‌کرد.
 * حالا هر سه یک فهرست‌اند: همان جای‌گیری (Radix)، همان جستجو، همان کلیدها.
 *
 * ⚠️ امضاها دست‌نخورده‌اند — هیچ‌کدام از فرم‌ها عوض نشدند:
 *  · مقدار مثلِ قبل در `<input type="hidden" name>` فرستاده می‌شود.
 *  · `Combobox` همچنان مقدارِ دوتایی دارد: شناسه (شاید null) + متن؛ با
 *    `allowFreeText` نامِ بیرون از فهرست هم پذیرفته می‌شود.
 *  · گزینهٔ غیرفعال در فهرست نمی‌آید، ولی اگر از قبل انتخاب شده باشد نامش
 *    (یا چیپش) می‌ماند و کاربر خودش برش می‌دارد (R-FORM-04).
 *
 * ⚠️ `modal` روی Popover — همان دلیلِ SearchableSelect: داخلِ Dialog، قفلِ
 * اسکرولِ دیالوگ چرخِ ماوس را روی فهرستِ پرتال‌شده می‌بلعید.
 */

import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';

export interface Option {
  value: number;
  label: string;
  /** متنِ کمکیِ ردیف — مثلاً ایمیل یا نامِ دفتر. */
  hint?: string;
  disabled?: boolean;
  /** نقطهٔ رنگی کنارِ گزینه و چیپ — برای تگ‌ها. */
  color?: string;
  /** پیش از نام — مثلاً آواتارِ عضو در «تخصیص به…». */
  media?: React.ReactNode;
}

/** جستجوی ساده و بی‌طرف نسبت به فاصله و «ی/ک» عربی. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ي/g, 'ی')   // ي عربی ← ی فارسی
    .replace(/ك/g, 'ک')   // ك عربی ← ک فارسی
    .replace(/‌/g, ' ')        // نیم‌فاصله مثلِ فاصله
    .replace(/\s+/g, ' ')
    .trim();
}

export function matches(option: Option, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return normalize(option.label).includes(q) || normalize(option.hint ?? '').includes(q);
}

/** صافیِ cmdk: هر ردیف با برچسب و متنِ کمکی‌اش (keywords) سنجیده می‌شود. */
function filter(_value: string, search: string, keywords?: string[]): number {
  return normalize((keywords ?? []).join(' ')).includes(normalize(search)) ? 1 : 0;
}

/**
 * ⚠️ «تایپ کن تا پیدا کنی» روی دکمهٔ بسته: نسخهٔ قبلی خودش ورودیِ متن بود و
 * کاربر مستقیم تایپ می‌کرد. حالا اولین حرف فهرست را باز می‌کند و جستجو را با
 * همان حرف شروع می‌کند. فاصله و Enter کارِ عادیِ دکمه را می‌کنند (باز کردن).
 */
export function typeToSearch(e: React.KeyboardEvent, start: (query: string) => void): void {
  if (e.key.length !== 1 || e.key === ' ' || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  start(e.key);
}

/** نشانگر پس از بازشدن در انتهای متنِ آغازینِ جستجو — وگرنه حرفِ بعدی پیش از اولی می‌نشست. */
export function focusAtEnd(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

// ⚠️ همان چهرهٔ `SearchableSelect`: دکمهٔ outline با مرزِ فیلدها (`border-input`)،
// و `data-[size=sm]:h-8` در نوارِ فیلتر تا ردیف یک خط بماند.
const triggerClass =
  'h-9 w-full min-w-0 justify-between gap-2 border-input px-3 font-normal data-[size=sm]:h-8';

/**
 * انتخابگرِ **تک‌مقداری**.
 *
 * ⚠️ نامِ آزاد (`allowFreeText`): هر طرف‌حسابی کاربرِ سامانه نیست. متنِ
 * جستجو اگر با هیچ گزینه‌ای یکی نباشد، ردیفِ «همین نام» بالای فهرست می‌آید.
 * و مثلِ نسخهٔ قبلی — که متنِ تایپ‌شده همان‌جا می‌ماند — بستنِ فهرست با کلیک
 * بیرون هم متن را نگه می‌دارد؛ فقط Escape بی‌تغییر می‌بندد.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  allowFreeText = false,
  name,
  id,
  disabled,
  size = 'default',
}: {
  options: Option[];
  value: { id: number | null; label: string };
  onChange: (next: { id: number | null; label: string }) => void;
  placeholder?: string;
  /** نامِ آزاد (خارج از فهرست) مجاز است؟ */
  allowFreeText?: boolean;
  /** نامِ فیلدِ مخفیِ شناسه، برای ارسال در فرم. */
  name?: string;
  id?: string;
  disabled?: boolean;
  size?: 'sm' | 'default';
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  // ردیفِ برجسته (مقدارِ cmdk) — با باز شدن روی گزینهٔ انتخاب‌شده می‌نشیند، نه روی «پاک‌کردن».
  const [active, setActive] = React.useState('');
  const escaped = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const typed = query.trim();
  const listed = options.filter((o) => !o.disabled);
  const exact = typed ? listed.filter((o) => normalize(o.label) === normalize(typed)) : [];
  const showFree = allowFreeText && typed !== '' && exact.length === 0;
  const hasValue = value.id !== null || value.label !== '';

  const start = (initial: string) => {
    escaped.current = false;
    setQuery(initial);
    // با متنِ آغازین، cmdk خودش اولین ردیفِ جورشده را برجسته می‌کند.
    setActive(!initial && value.id !== null ? String(value.id) : '');
    setOpen(true);
  };

  const pick = (next: { id: number | null; label: string }) => {
    onChange(next);
    setOpen(false);
  };

  /** متنِ تایپ‌شده ← گزینهٔ هم‌نام اگر دقیقاً یکی باشد، وگرنه نامِ آزاد. */
  const commitTyped = () => {
    if (!allowFreeText || typed === '') return;
    if (exact.length === 1) onChange({ id: exact[0]!.value, label: exact[0]!.label });
    else if (typed !== value.label || value.id !== null) onChange({ id: null, label: typed });
  };

  return (
    <div data-slot="combobox" className="relative w-full min-w-0">
      {name && <input type="hidden" name={name} value={value.id ?? ''} />}
      <Popover
        open={open}
        modal
        onOpenChange={(next) => {
          if (next) {
            // نامِ آزادِ فعلی در جستجو می‌نشیند تا ویرایش شود، نه اینکه از نو تایپ شود.
            start(value.id === null ? value.label : '');
            return;
          }
          if (!escaped.current) commitTyped();
          setOpen(false);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            data-size={size}
            onKeyDown={(e) => { if (!open) typeToSearch(e, start); }}
            className={triggerClass}
          >
            <span className={cn('flex min-w-0 flex-1 items-center gap-1.5 text-start', !value.label && 'text-muted-foreground')}>
              {value.id !== null && listed.find((o) => o.value === value.id)?.media}
              <span className="min-w-0 truncate">{value.label || placeholder || t('جستجو…')}</span>
            </span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-56 p-0"
          onEscapeKeyDown={() => { escaped.current = true; }}
          onOpenAutoFocus={(e) => { e.preventDefault(); focusAtEnd(inputRef.current); }}
        >
          <Command filter={filter} value={active} onValueChange={setActive}>
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder={placeholder ?? t('جستجو…')}
            />
            <CommandList>
              {/* ردیفِ «همین نام» خودش می‌گوید چیزی پیدا نشد؛ پیامِ خالی دوبار نمی‌آید. */}
              {!showFree && <CommandEmpty>{t('موردی پیدا نشد.')}</CommandEmpty>}
              {/*
                ⚠️ پاک‌کردن هم یک ردیف است، نه دکمه‌ای روی فیلد: دکمه در دکمه نامعتبر است.
                ⚠️ `forceMount` روی این ردیف و ردیفِ «همین نام» — و روی گروهشان، که
                وگرنه چون ردیفِ ثبت‌شده‌ای ندارد پنهان می‌شد: صافیِ cmdk با keywords ِ
                رندرِ **قبلی** می‌سنجد، پس ردیفی که متنش با خودِ جستجو عوض می‌شود با
                حرفِ دوم پنهان می‌ماند.
              */}
              {hasValue && !typed && (
                <CommandGroup forceMount>
                  <CommandItem forceMount value="__clear__" onSelect={() => pick({ id: null, label: '' })}>
                    <XIcon />
                    <span className="text-muted-foreground">{t('پاک‌کردن')}</span>
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup>
                {listed.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={String(o.value)}
                    keywords={[o.label, o.hint ?? '']}
                    onSelect={() => pick({ id: o.value, label: o.label })}
                  >
                    {o.media}
                    <span className="min-w-0 truncate">{o.label}</span>
                    <span className="ms-auto flex shrink-0 items-center gap-2">
                      {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                      <CheckIcon className={o.value === value.id ? 'opacity-100' : 'opacity-0'} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {/* پایینِ فهرست: Enter اول کاربرِ جورشده را برمی‌دارد، نه نامِ آزاد را. */}
              {showFree && (
                <CommandGroup forceMount>
                  <CommandItem forceMount value="__free__" onSelect={() => pick({ id: null, label: typed })}>
                    <PlusIcon />
                    <span className="grid min-w-0">
                      <span className="truncate">«{typed}»</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t('در فهرست نیست — همین نام ثبت می‌شود.')}
                      </span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * انتخابگرِ **چندمقداری** با چیپ.
 *
 * ⚠️ چیپ‌ها و دکمهٔ بازکردن **کنارِ هم** در یک قاب‌اند، نه چیپ داخلِ دکمه:
 * دکمهٔ × داخلِ دکمهٔ دیگر HTML ِ نامعتبر است و کلیکش به دکمهٔ بیرونی هم
 * می‌رسید. قاب لنگرِ فهرست است (`PopoverAnchor`)، پس فهرست هم‌عرضِ کلِ فیلد باز
 * می‌شود.
 *
 * ⚠️ فهرست همهٔ گزینه‌ها را با تیک نشان می‌دهد و کلیک روشن/خاموش می‌کند؛
 * انتخاب‌شده‌ها در فهرست گم نمی‌شوند. Backspace در جستجوی خالی آخرین چیپ را
 * برمی‌دارد، مثلِ نسخهٔ قبلی.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  name,
  id,
  size = 'default',
  emptyText,
  disabled,
}: {
  options: Option[];
  selected: number[];
  onChange: (next: number[]) => void;
  placeholder?: string;
  name?: string;
  id?: string;
  /** `sm` در نوارِ فیلتر — هم‌قدِ بقیهٔ کنترل‌های `sm` (۳۲ پیکسل). */
  size?: 'sm' | 'default';
  /** وقتی اصلاً گزینه‌ای تعریف نشده. */
  emptyText?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const byId = React.useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const listed = options.filter((o) => !o.disabled);

  const toggle = (v: number) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const start = (initial: string) => {
    setQuery(initial);
    setOpen(true);
  };

  return (
    <div data-slot="multi-select" className="relative w-full min-w-0">
      {/* هر انتخاب یک ورودیِ جدا، تا FormData آرایه بگیرد. */}
      {name && selected.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      <Popover open={open} onOpenChange={(next) => (next ? start('') : setOpen(false))} modal>
        <PopoverAnchor asChild>
          <div
            data-size={size}
            // کلیک روی فضای خالیِ قاب (نه چیپ) هم فهرست را باز می‌کند.
            onClick={(e) => { if (e.target === e.currentTarget && !disabled) start(''); }}
            className={cn(
              'flex min-h-9 w-full min-w-0 flex-wrap items-center gap-1 rounded-md border border-input bg-card py-1 ps-1.5 pe-3 text-sm shadow-xs transition-[color,box-shadow] dark:bg-input/30',
              'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
              'data-[size=sm]:min-h-8 data-[size=sm]:py-0.5',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            {selected.map((v) => {
              const o = byId.get(v);
              const label = o?.label ?? `#${v}`;
              return (
                <span
                  key={v}
                  data-slot="multi-select-chip"
                  className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md bg-muted py-0.5 ps-1.5 pe-0.5 text-xs"
                >
                  {o?.color && (
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
                  )}
                  {o?.media}
                  <span className="truncate">{label}</span>
                  <button
                    type="button"
                    aria-label={`${t('برداشتن')} ${label}`}
                    onClick={() => toggle(v)}
                    className="rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-[2px] focus-visible:ring-ring/50"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              );
            })}
            <PopoverTrigger asChild>
              <button
                id={id}
                type="button"
                role="combobox"
                aria-expanded={open}
                disabled={disabled}
                onKeyDown={(e) => { if (!open) typeToSearch(e, start); }}
                className="flex min-h-6 min-w-16 flex-1 items-center justify-between gap-2 ps-1 text-start outline-none"
              >
                <span className="truncate text-muted-foreground">
                  {selected.length === 0 ? (placeholder ?? t('افزودن…')) : ''}
                </span>
                <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground opacity-50" />
              </button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-56 p-0"
          onOpenAutoFocus={(e) => { e.preventDefault(); focusAtEnd(inputRef.current); }}
        >
          <Command filter={filter}>
            <CommandInput
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder={t('جستجو…')}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && query === '' && selected.length > 0) {
                  onChange(selected.slice(0, -1));
                }
              }}
            />
            <CommandList>
              <CommandEmpty>
                {listed.length === 0 ? (emptyText ?? t('موردی نیست')) : t('موردی پیدا نشد.')}
              </CommandEmpty>
              <CommandGroup>
                {listed.map((o) => {
                  const on = selected.includes(o.value);
                  return (
                    <CommandItem
                      key={o.value}
                      value={String(o.value)}
                      keywords={[o.label, o.hint ?? '']}
                      data-checked={on}
                      // فوکوس در جستجو بماند تا بعد از کلیک هم بشود تایپ کرد (و Backspace چیپ بردارد).
                      onMouseDown={(e) => e.preventDefault()}
                      onSelect={() => toggle(o.value)}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs',
                          on ? 'border-primary bg-primary' : 'border-input bg-card',
                        )}
                      >
                        {on && <CheckIcon className="size-3 text-primary-foreground" />}
                      </span>
                      {o.color && (
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
                      )}
                      {o.media}
                      <span className="min-w-0 truncate">{o.label}</span>
                      {o.hint && <span className="ms-auto shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
