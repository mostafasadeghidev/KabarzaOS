import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { PageCrumb } from '@/components/page-crumb';

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
 * ⚠️ مقیاسِ فاصله (DESIGN.md §۴): بینِ بخش‌های صفحه ۲۴ و روی نمایشگرِ بزرگ
 * ۳۲ پیکسل؛ حاشیهٔ صفحه ۱۶ / ۲۴ / ۳۲. فضای خالی کارِ جداکردن را می‌کند —
 * بخش‌ها با فاصله از هم جدا می‌شوند، نه با خط یا قابِ اضافه.
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
        '@container/main flex flex-1 flex-col gap-6 p-4 md:gap-8 md:p-6 lg:p-8',
        // ⚠️ هم‌تراز با لبهٔ شروعِ صفحه‌های دیگر، نه وسط‌چین: صفحهٔ وسط‌چین در کنارِ
        // بقیه که از کنارِ منو شروع می‌شوند، ناهمسان دیده می‌شد (همان قاعدهٔ TabPanel).
        width === 'reading' && 'w-full max-w-4xl',
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
      {/* عنوان به نوارِ بالای محتوا هم می‌رود («بخش › عنوان») — فقط عنوانِ رشته‌ای. */}
      <PageCrumb
        title={typeof title === 'string' ? title : undefined}
        backHref={back?.href}
        backLabel={typeof back?.label === 'string' ? back.label : undefined}
      />
      {back && <BackLink href={back.href}>{back.label}</BackLink>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {media}
          <div className="grid min-w-0 gap-1">
            {/* ⚠️ بی `tracking-tight`: فشرده‌کردنِ فاصلهٔ حروف اتصالِ حروفِ فارسی را می‌شکند. */}
            <h1 className="text-2xl font-bold">{title}</h1>
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

/**
 * سرِ یک بخش داخلِ صفحه یا تب — عنوانِ کوچک، یک خطِ توضیح، دکمه‌ها در لبهٔ مقابل.
 *
 * ⚠️ چرا لازم شد: عنوانِ بخش‌ها یازده شکلِ مختلف داشت — `text-sm font-semibold`،
 * `text-sm font-medium`، `text-xs` با حاشیهٔ پایین، `<p>` به‌جای عنوان، و دکمهٔ
 * «افزودن» گاهی کنارِ عنوان، گاهی زیرش. همان سلسله‌مراتبِ `PageHeader`، یک
 * پله کوچک‌تر (DESIGN.md §۳): عنوانِ صفحه ۲۴/۷۰۰، عنوانِ بخش ۱۶/۷۰۰،
 * زیربخشِ `h3` ۱۴/۶۰۰. سلسله‌مراتب با وزن ساخته می‌شود: عنوانِ پررنگ در
 * برابرِ متنِ آرام تا روشن باشد مهم‌ترین چیزِ صفحه کجاست.
 */
export function SectionHeader({
  title,
  description,
  actions,
  icon,
  as: Heading = 'h2',
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** آیکونِ کوچکِ کنارِ عنوان (مثلاً گیره برای پیوست‌ها). */
  icon?: React.ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2', className)}>
      <div className="grid min-w-0 gap-0.5">
        <Heading
          className={cn(
            'flex items-center gap-1.5 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground',
            Heading === 'h2' ? 'text-base font-bold' : 'text-sm font-semibold',
          )}
        >
          {icon}
          {title}
        </Heading>
        {description && <div className="text-[13px] text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * پنل — کارتِ عنوان‌دار: سطحِ سفید با عنوان و دکمه‌ها در یک ردیف.
 *
 * ⚠️ سرِ پنل خطِ جداکننده ندارد (DESIGN.md §۵): فاصله عنوان را از محتوا جدا
 * می‌کند. با خطِ زیرِ هر عنوان، صفحه‌ای با ده پنل بیست خطِ افقی داشت.
 *
 * ⚠️ چرا لازم شد: کارتِ عنوان‌دار پنج شکل داشت — پنلِ داشبورد (همین شکل)،
 * `CardHeader` با عنوانِ ۱۶ پیکسلی که دکمه‌اش زیرِ عنوان می‌افتاد (`CardHeader`
 * grid است و `flex-row` رویش اثری نداشت)، کارت‌های فشردهٔ تبِ مدیریت، و دو
 * اندازهٔ دیگر در «تسک‌ها» و «ساعتِ کاری». حالا همه همان پنلِ داشبوردند.
 *
 * `flush`  — محتوا بی‌حاشیه: جدولِ داخلِ پنل (`<Table frame={false}>`) تا لبه می‌رسد.
 * `tone`   — `danger` برای کارِ برگشت‌ناپذیر (حذفِ پروژه)، `warning` برای هشدار.
 */
export function Panel({
  title,
  description,
  icon,
  actions,
  tone = 'default',
  flush = false,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: 'default' | 'danger' | 'warning';
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        'gap-0 py-0',
        tone === 'danger' && 'border-destructive/40',
        tone === 'warning' && 'border-amber-500/50',
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3.5">
        <div className="grid min-w-0 gap-0.5">
          <h3
            className={cn(
              'flex items-center gap-1.5 text-sm font-semibold [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground',
              tone === 'danger' && 'text-destructive',
            )}
          >
            {icon}
            {title}
          </h3>
          {description && <div className="text-[13px] text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {/*
        ⚠️ جدولِ بی‌حاشیه: سلولِ اول و آخر همان تورفتگیِ عنوان را می‌گیرند تا
        متنِ ستون‌ها زیرِ عنوانِ پنل بیفتد، نه چهار پیکسل بیرون‌تر.
      */}
      <div
        className={flush
          ? 'pt-1.5 pb-1 [&_td:first-child]:ps-4 [&_td:last-child]:pe-4 [&_th:first-child]:ps-4 [&_th:last-child]:pe-4'
          : 'grid grid-cols-1 gap-3 px-4 pt-3 pb-4'}
      >
        {children}
      </div>
    </Card>
  );
}

/**
 * یک بخش — سرِ بخش و محتوایش با فاصلهٔ ثابتِ `gap-3`.
 *
 * ⚠️ `grid-cols-1` همان دلیلِ `TabPanel` را دارد: جدولِ پهن داخلِ بخش باید
 * خودش پیمایش بخورد، نه اینکه صفحه را پهن کند.
 */
export function Section({
  title,
  description,
  actions,
  icon,
  className,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('grid grid-cols-1 gap-3', className)}>
      {title !== undefined && (
        <SectionHeader title={title} description={description} actions={actions} icon={icon} />
      )}
      {children}
    </section>
  );
}
