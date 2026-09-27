import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * کارتِ آمارِ کوچک — برچسبِ کم‌رنگ بالا، رقمِ درشت پایین.
 *
 * ⚠️ چرا لازم شد: همین کارت در ده فایل دستی ساخته می‌شد و هر جا شکلِ
 * خودش را داشت — برچسبِ ۱۲ یا ۱۴ پیکسلی، رقمِ ۱۴ تا ۲۴ پیکسلی و فاصله‌های
 * جدا. کنارِ هم (گزارش‌ها، مالی، پروژه) چشم تفاوت را می‌دید. ساختار همان
 * `SectionCards` ِ داشبوردِ رسمیِ shadcn است: `CardDescription` برای
 * برچسب و `CardTitle` برای رقم، در یک `CardHeader`.
 *
 * `emphasis="quiet"` برای رقم‌های فرعی کنارِ رقمِ اصلی (جمعِ جزء کنارِ
 * مانده) — تأکیدِ نسبی حفظ می‌شود، نه اندازه‌های پراکنده.
 * `numeric={false}` برای متن (مثلاً وضعیتِ پرداخت): `.num` جهت را
 * چپ‌به‌راست می‌کند و متنِ فارسی را به هم می‌ریزد.
 * `href` کلِ کارت را پیوند می‌کند، نه فقط رقم را — هدفِ کلیک بزرگ است.
 */
export function StatCard({
  label,
  value,
  tone = 'default',
  emphasis = 'strong',
  numeric = true,
  href,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger';
  emphasis?: 'strong' | 'quiet';
  numeric?: boolean;
  href?: string | null;
}) {
  const card = (
    <Card
      className={cn(
        'h-full gap-0 py-4 shadow-xs',
        tone === 'danger' && 'border-destructive/50',
        href && 'transition-colors hover:bg-muted/50',
      )}
    >
      <CardHeader className="gap-1.5 px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            numeric && 'num',
            emphasis === 'strong' ? 'text-xl font-semibold' : 'text-base font-medium',
            tone === 'warning' && 'text-amber-700 dark:text-amber-500',
            tone === 'danger' && 'text-destructive',
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );

  if (!href) return card;
  return (
    <Link href={href} className="block rounded-xl">
      {card}
    </Link>
  );
}
