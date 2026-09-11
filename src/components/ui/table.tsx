import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * جدول — پرکاربردترین کامپوننتِ این اپ (گزارش‌ها و دفترکل).
 *
 * ⚠️ R-I18N-05 — نسخهٔ اصلیِ shadcn سلول‌ها را `text-left` می‌کند که در RTL
 * غلط است. اینجا `text-start` استفاده شده تا جهت از زبان بیاید.
 * REQUIREMENTS هـ-۱۳ — چگالیِ بالا: padding کمتر تا ردیفِ بیشتر دیده شود.
 */
export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b transition-colors hover:bg-muted/50', className)} {...props} />;
}

/**
 * ترازِ ستونِ عددی — سرستون و سلول **هر دو** از همین می‌خوانند تا هرگز از هم جدا نشوند.
 *
 * ⚠️ عدد در **هر** زبانی راست‌چین است: رقم همیشه چپ‌به‌راست نوشته می‌شود و
 * ستونِ عدد باید رقمِ یکان را زیرِ رقمِ یکان بچیند. در فارسی راست همان
 * «ابتدا» ی جدول است، پس سرستون و عدد لبهٔ راستِ مشترک دارند، مثلِ ستون‌های
 * متنی؛ در انگلیسی همان «انتها» ی مرسومِ جدولِ مالی. `text-end` ِ تنها (۱.۷۳.۰)
 * در فارسی عدد و سرستون را **چپ**‌چین می‌کرد: لبهٔ چپشان یکی بود ولی چشمِ
 * خوانندهٔ راست‌به‌چپ لبهٔ راست را می‌سنجد و ستون «زیرِ هم نبود».
 *
 * ⚠️ نه `text-right`: گاردِ R-I18N-05 (`rtl-safety.test.ts`) کلاسِ فیزیکی را رد
 * می‌کند؛ این دو کلاسِ منطقی همان نتیجه را با جهتِ صریح می‌دهند.
 */
const NUMERIC_ALIGN = 'ltr:text-end rtl:text-start';

export function TableHead({
  className,
  numeric = false,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  /** سرستونِ ستونی که سلول‌هایش `TableNumericCell` اند. */
  numeric?: boolean;
}) {
  return (
    <th
      className={cn(
        'h-9 px-3 text-start align-middle text-xs font-medium text-muted-foreground',
        numeric && NUMERIC_ALIGN,
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 align-middle', className)} {...props} />;
}

/**
 * سلولِ عددی — اعداد همیشه LTR و هم‌عرض (R-I18N-07)، با ترازِ `NUMERIC_ALIGN`.
 *
 * ⚠️ `num` روی یک `<span>` ِ درونی می‌نشیند، نه روی خودِ سلول: `num` جهت را
 * LTR می‌کند و روی سلول، جهتِ خودِ سلول را هم عوض می‌کرد.
 *
 * ⚠️ سرستونِ همین ستون باید `<TableHead numeric>` باشد — `TableHead` پیش‌فرض
 * `text-start` است و بدونِ آن سرستون و عدد به دو لبهٔ ستون می‌رفتند (۹۸
 * سرستون تا ۱.۷۳.۰ همین‌طور بودند).
 */
export function TableNumericCell({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-3 py-2 align-middle', NUMERIC_ALIGN, className)} {...props}>
      <span className="num">{children}</span>
    </td>
  );
}
