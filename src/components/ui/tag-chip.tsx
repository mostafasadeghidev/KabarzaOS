import { cn } from '@/lib/utils';

/**
 * نمایشِ یک مقدارِ تگ‌دار (نقش، وضعیت، دسته) — چیپِ خنثی با نقطهٔ رنگِ تگ.
 *
 * ⚠️ چرا نه بجِ پُررنگ (DESIGN.md §۲): رنگِ تگ را کاربر انتخاب می‌کند و
 * هر رنگی ممکن است. بجِ توپر با متنِ سفید روی رنگِ روشن (مثلاً #c0b9f3)
 * ناخوانا بود و در جدول چند بجِ رنگی کنارِ هم صفحه را شلوغ می‌کرد. نقطه
 * همان اطلاعاتِ رنگ را می‌دهد و متن همیشه تیره روی زمینهٔ خنثی می‌ماند.
 */
export function TagChip({
  color,
  className,
  children,
}: {
  color?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-slot="tag-chip"
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color || 'var(--color-muted-foreground)' }}
      />
      {children}
    </span>
  );
}
