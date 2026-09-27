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
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <div className="text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * بدنهٔ یک تب — همان قاعدهٔ عرض و فاصلهٔ `PageShell`، یک سطح پایین‌تر.
 *
 * ⚠️ چرا لازم شد: تب‌های **یک** صفحه هر کدام قاعدهٔ خودشان را داشتند —
 * سه فاصلهٔ متفاوت (۳، ۴، ۵) و دو عرضِ متفاوت. حالا تصمیمِ عرض کنارِ خودِ
 * تب نوشته می‌شود و فاصله دیگر انتخابی نیست.
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
    <div className={cn('grid gap-4', width === 'reading' && 'w-full max-w-4xl', className)}>
      {children}
    </div>
  );
}
