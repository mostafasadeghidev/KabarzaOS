import { Skeleton } from '@/components/ui/skeleton';

/**
 * پوستهٔ صفحه در زمانِ بارگذاری — همان چیدمانی که یک لحظه بعد پر می‌شود.
 *
 * ⚠️ چرا لازم شد: هیچ `loading.tsx` ای در اپ نبود، پس با هر پیمایش Next
 * منتظرِ کاملِ دادهٔ سرور می‌ماند و کاربر روی صفحهٔ **قبلی** گیر می‌کرد —
 * بی‌آنکه بداند کلیکش کار کرده یا نه. حالا سرصفحه فوری می‌آید و بدنه
 * جایش را نگه می‌دارد.
 *
 * ⚠️ شکلِ اسکلت باید به چیدمانِ واقعیِ همان صفحه بخورد، وگرنه لحظهٔ
 * جایگزینی صفحه می‌پرد: `cards` برای صفحه‌های کارتی (پروژه‌ها، اعضا) و
 * `table` برای صفحه‌های جدولی.
 */
export function PageSkeleton({
  variant = 'table',
  rows = 6,
}: {
  variant?: 'table' | 'cards';
  rows?: number;
}) {
  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header className="grid gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-24" />
      </header>

      {variant === 'cards' ? (
        <div className="grid gap-3 @2xl/main:grid-cols-2 @5xl/main:grid-cols-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      )}
    </main>
  );
}
