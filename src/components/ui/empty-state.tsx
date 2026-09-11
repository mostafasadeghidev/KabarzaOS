import { cn } from '@/lib/utils';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

/**
 * حالتِ خالی — به‌جای صفحهٔ سفید، توضیحِ روشن.
 *
 * ⚠️ روی `Empty` ِ رسمیِ shadcn سوار است، پس هر ۷۷ جای استفاده بی‌تغییرِ
 * کد همان ظاهر را می‌گیرند. دو تنظیم روی کدِ رسمی:
 *  · `border` — نسخهٔ رسمی فقط `border-dashed` دارد و ضخامت را به
 *    مصرف‌کننده می‌سپارد؛ بدونِ آن هیچ قابی دیده نمی‌شد.
 *  · عنوان `text-base` به‌جای `text-lg` و فاصلهٔ کمتر — این حالت‌ها اغلب
 *    داخلِ تب یا کارت‌اند و چگالی مهم است (REQUIREMENTS هـ-۱۳).
 */
export function EmptyState({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: string;
  /** آیکونِ اختیاری — در قابِ گردِ `EmptyMedia`. */
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn('border p-6 md:p-10', className)}>
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}
