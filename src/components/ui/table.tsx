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

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('h-9 px-3 text-start align-middle text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 align-middle', className)} {...props} />;
}

/** سلولِ عددی — اعداد همیشه LTR و هم‌عرض (R-I18N-07). */
export function TableNumericCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 align-middle text-end num', className)} {...props} />;
}
