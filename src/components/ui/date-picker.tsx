'use client';

/**
 * انتخابگرِ تاریخ — ترکیبِ رسمیِ shadcn: Popover + Calendar + Button.
 *
 * ⚠️ قراردادِ فرم عوض نمی‌شود: مقدار همان رشتهٔ `yyyy-mm-dd` است که
 * `<input type="date">` می‌فرستاد، در یک `<input type="hidden" name>`. پس هیچ
 * اکشنِ سرور یا فیلترِ GET دست نمی‌خورد.
 *
 * ⚠️ `required` روی input ِ پنهان بی‌اثر است (مرورگر فیلدِ hidden را اعتبارسنجی
 * نمی‌کند). یک input ِ نامرئی و **بی‌نام** روی دکمه همان جلوگیری از ارسالِ
 * خالی را نگه می‌دارد و پیامِ مرورگر کنارِ خودِ فیلد ظاهر می‌شود.
 *
 * ⚠️ تقویم میلادی می‌ماند، با نامِ ماه و روزِ هفته به زبانِ کاربر: همهٔ تاریخ‌های
 * اپ میلادی نمایش داده می‌شوند و تقویمِ دیگری در انتخابگر، تاریخِ انتخاب‌شده را
 * با تاریخِ نمایش‌داده ناهمخوان می‌کرد. ارقام لاتین‌اند (R-I18N-07).
 */

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { arSA, ckb, de, enUS, es, faIR, fr, pt, tr as trTR } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useDirection } from '@/components/ui/direction';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocale } from '@/i18n/client';
import { cn } from '@/lib/utils';

const DAY_PICKER_LOCALES = { fa: faIR, ar: arSA, ckb, en: enUS, de, es, fr, pt, tr: trTR };

/**
 * برچسبِ BCP-47 برای نامِ ماه در فهرستِ کشویی — با تقویمِ **میلادی** اجباری.
 *
 * ⚠️ `-u-ca-gregory` اختیاری نیست: مرورگر برای `fa-IR` تقویمِ پیش‌فرض را
 * خورشیدی می‌گیرد (و برای بعضی زبان‌های عربی قمری). بدونِ آن، سرِ تقویم
 * «شهریور» می‌نوشت در حالی که خانه‌های زیرش روزهای سپتامبر بودند.
 */
const LOCALE_TAGS: Record<string, string> = {
  fa: 'fa-IR-u-ca-gregory', ar: 'ar-u-ca-gregory', ckb: 'ckb-u-ca-gregory', en: 'en-US-u-ca-gregory',
  de: 'de-DE-u-ca-gregory', es: 'es-ES-u-ca-gregory', fr: 'fr-FR-u-ca-gregory', pt: 'pt-PT-u-ca-gregory',
  tr: 'tr-TR-u-ca-gregory',
};

/** تاریخِ محلی ← `yyyy-mm-dd`. ⚠️ نه `toISOString`: آن UTC است و روز را جابه‌جا می‌کند. */
function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromIso(value: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

export interface DatePickerProps {
  id?: string;
  name?: string;
  /** کنترل‌شده — `yyyy-mm-dd` یا رشتهٔ خالی. */
  value?: string;
  /** کنترل‌نشده — مقدارِ آغازین. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  /** کمینه/بیشینهٔ مجاز — `yyyy-mm-dd`. */
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  size?: 'sm' | 'default';
  /** کلاسِ پوسته — پهنا (مثلِ `w-36`) اینجا می‌نشیند. */
  className?: string;
  'aria-label'?: string;
}

export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onChange,
  required,
  min,
  max,
  disabled,
  placeholder,
  size = 'default',
  className,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const locale = useLocale();
  const dir = useDirection();
  const controlled = value !== undefined;
  const [inner, setInner] = React.useState(defaultValue ?? '');
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // مقدارِ آغازینِ تازه (مثلاً مقدارِ برگشتی پس از خطای فرم) جایگزین می‌شود.
  React.useEffect(() => {
    if (!controlled) setInner(defaultValue ?? '');
  }, [controlled, defaultValue]);

  /**
   * ⚠️ فرمِ کنترل‌نشده پس از اکشنِ موفق `reset` می‌شود (React 19). input ِ
   * بومی خودش به مقدارِ آغازین برمی‌گشت؛ این state باید صریحاً برگردد.
   */
  React.useEffect(() => {
    const form = triggerRef.current?.form;
    if (!form || controlled) return;
    const onReset = () => setInner(defaultValue ?? '');
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, [controlled, defaultValue]);

  const current = (controlled ? value : inner) ?? '';
  const selected = fromIso(current);
  const minDate = fromIso(min);
  const maxDate = fromIso(max);
  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];
  const year = new Date().getFullYear();

  const pick = (day: Date | undefined) => {
    const iso = day ? toIso(day) : '';
    if (!controlled) setInner(iso);
    onChange?.(iso);
    setOpen(false);
  };

  return (
    <div className={cn('relative w-full', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            size={size}
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn('w-full justify-between font-normal', !current && 'text-muted-foreground')}
          >
            <span className={cn('truncate', current && 'num')}>{current || placeholder || '—'}</span>
            <CalendarIcon className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? minDate}
            onSelect={pick}
            captionLayout="dropdown"
            startMonth={new Date(year - 10, 0)}
            endMonth={new Date(year + 5, 11)}
            dir={dir}
            locale={DAY_PICKER_LOCALES[locale as keyof typeof DAY_PICKER_LOCALES] ?? enUS}
            disabled={disabledDays.length > 0 ? disabledDays : undefined}
            formatters={{
              formatMonthDropdown: (d) => d.toLocaleString(LOCALE_TAGS[locale] ?? 'en-US-u-ca-gregory', { month: 'short' }),
            }}
          />
        </PopoverContent>
      </Popover>
      {name && <input type="hidden" name={name} value={current} />}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={current}
          onChange={() => {}}
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      )}
    </div>
  );
}

function splitDateTime(value: string | undefined): { date: string; time: string } {
  return {
    date: value?.slice(0, 10) ?? '',
    time: value && value.length >= 16 ? value.slice(11, 16) : '',
  };
}

/**
 * تاریخ + ساعت — جایگزینِ `datetime-local`، به همان شکلِ نمونهٔ shadcn:
 * انتخابگرِ تاریخ کنارِ `Input type="time"`.
 * ⚠️ مقدار همان `yyyy-MM-ddTHH:mm` است که فیلدِ بومی می‌فرستاد.
 */
export function DateTimePicker({
  id,
  name,
  defaultValue,
  required,
  disabled,
  className,
}: {
  id?: string;
  name?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [parts, setParts] = React.useState(() => splitDateTime(defaultValue));
  const timeRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setParts(splitDateTime(defaultValue));
  }, [defaultValue]);

  React.useEffect(() => {
    const form = timeRef.current?.form;
    if (!form) return;
    const onReset = () => setParts(splitDateTime(defaultValue));
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  }, [defaultValue]);

  const combined = parts.date && parts.time ? `${parts.date}T${parts.time}` : '';

  return (
    <div className={cn('flex gap-2', className)}>
      <DatePicker
        id={id}
        value={parts.date}
        onChange={(date) => setParts((p) => ({ ...p, date }))}
        required={required}
        disabled={disabled}
        className="min-w-0 flex-1"
      />
      <Input
        ref={timeRef}
        type="time"
        value={parts.time}
        onChange={(e) => setParts((p) => ({ ...p, time: e.target.value }))}
        required={required}
        disabled={disabled}
        className="num w-28 shrink-0 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
      />
      {name && <input type="hidden" name={name} value={combined} />}
    </div>
  );
}
