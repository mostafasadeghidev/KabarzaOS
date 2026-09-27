import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * پوسته و سرصفحهٔ مشترکِ همهٔ صفحه‌ها.
 *
 * ⚠️ چرا لازم شد: هر صفحه چیدمانِ خودش را از صفر می‌ساخت. نتیجه سه فاصلهٔ
 * متفاوت بینِ بخش‌ها، دو عرضِ متفاوت و سرصفحه‌هایی با تایپوگرافیِ ناهمسان
 * بود — در تب‌های **یک** صفحه هم فرق می‌کرد. اینجا یک بار تصمیم گرفته
 * می‌شود و همه‌جا همان اجرا می‌شود.
 *
 * ⚠️ قاعدهٔ عرض دو سطح دارد و تصمیمِ مالک است:
 *   `full`    — جدول، کارت، داشبورد: از لبه تا لبه، چون داده افقی نفس می‌خواهد.
 *   `reading` — متن و فرم (نظرات، فایل‌ها، پروفایل): `max-w-4xl` و وسط‌چین،
 *               چون خطِ بلندتر از ~۷۵ نویسه خواندن را سخت می‌کند.
 * همان قاعده‌ای که خودِ shadcn در نمونه‌هایش به کار می‌برد.
 *
 * ⚠️ مقیاسِ فاصله: `gap-4` بینِ بخش‌های صفحه (و `md:gap-6` روی نمایشگرِ
 * بزرگ، مثلِ داشبوردِ رسمیِ shadcn). داخلِ یک بخش `gap-2`.
 */
export function PageShell({
  width = 'full',
  className,
  children,
}: {
  width?: 'full' | 'reading';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className={cn(
        '@container/main flex flex-1 flex-col gap-4 p-4 md:gap-6 lg:p-6',
        width === 'reading' && 'mx-auto w-full max-w-4xl',
        className,
      )}
    >
      {children}
    </main>
  );
}

/**
 * سرصفحهٔ صفحه — عنوان، یک خطِ توضیح، و دکمه‌های اصلی در لبهٔ مقابل.
 *
 * ⚠️ دکمهٔ اصلیِ صفحه جای ثابتی می‌خواهد. پیش از این بعضی صفحه‌ها آن را
 * بالای فهرست می‌گذاشتند، بعضی وسطِ نوارِ فیلترها و بعضی اصلاً پایین؛ چشم
 * هر بار باید دنبالش می‌گشت.
 *
 * `back`     — صفحه‌های جزئیات (گزارشِ یک عضو، پروژه، …) راهِ برگشت به
 *              فهرستِ مادر را بالای عنوان دارند. ⚠️ پیش از این چهار شکلِ
 *              مختلف داشت: پیکان در متنِ ترجمه («← پروژه‌ها»)، پیکانِ آیکونی
 *              که در زبان‌های چپ‌به‌راست برعکس می‌ماند، مسیرِ نان‌ریزه‌ای، و
 *              دو اندازهٔ قلم. برچسب نامِ همان صفحهٔ مادر است.
 * `media`    — تصویرِ کنارِ عنوان (آواتارِ عضو).
 * `children` — ردیفِ چیپ‌های زیرِ عنوان (وضعیت، برچسب‌ها).
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  media,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: React.ReactNode };
  media?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="grid gap-2">
      {back && <BackLink href={back.href}>{back.label}</BackLink>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {media}
          <div className="grid min-w-0 gap-1">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <div className="text-sm text-muted-foreground">{description}</div>
            )}
            {children && (
              <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * پیوندِ «برگشت به صفحهٔ مادر» — یک شکل همه‌جا (سرصفحه، فاکتور).
 * برچسب نامِ صفحهٔ مادر است؛ پیکان جهتِ برگشت را می‌گوید.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {/* در راست‌به‌چپ «برگشت» به راست است؛ در چپ‌به‌راست به چپ. */}
      <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
      {children}
    </Link>
  );
}

/**
 * بدنهٔ یک تب — همان قاعدهٔ عرض و فاصلهٔ `PageShell`، یک سطح پایین‌تر.
 *
 * ⚠️ چرا لازم شد: تب‌های **یک** صفحه هر کدام قاعدهٔ خودشان را داشتند —
 * سه فاصلهٔ متفاوت (۳، ۴، ۵) و دو عرضِ متفاوت. حالا تصمیمِ عرض کنارِ خودِ
 * تب نوشته می‌شود و فاصله دیگر انتخابی نیست.
 *
 * ⚠️ `grid-cols-1` یعنی `minmax(0, 1fr)`: ستونِ پیش‌فرضِ grid (`auto`) هرگز
 * از حداقل‌عرضِ محتوا کوچک‌تر نمی‌شود، پس یک جدولِ پهن روی موبایل کلِ صفحه
 * را پهن می‌کرد به‌جای آنکه خودش پیمایش بخورد.
 */
export function TabPanel({
  width = 'full',
  className,
  children,
}: {
  width?: 'full' | 'reading';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-4', width === 'reading' && 'w-full max-w-4xl', className)}>
      {children}
    </div>
  );
}
