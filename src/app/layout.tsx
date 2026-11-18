import type { Metadata, Viewport } from 'next';
import { currentSession } from '@/server/auth';
import { getSystemConfig } from '@/server/settings/system-service';
import { direction } from '@/i18n/config';
import { primeTranslations, getT } from '@/i18n/server';
import { brandIdentity } from '@/server/setup/public-brand';
import { TranslationProvider } from '@/i18n/client';
import { ThemeProvider } from '@/components/theme-provider';
import { themeScript } from '@/components/theme-script';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm';
import { DirectionProvider } from '@/components/ui/direction';
import { ServiceWorkerRegister } from '@/components/service-worker';
import { ICON_BACKGROUND } from '@/domain/brand/icon';
/*
 * ⚠️ قلمِ برنامه همراهِ خودِ برنامه (۳.۷.۰): وزیرمتنِ متغیر از npm، کنارِ فایل‌های برنامه سِرو
 * می‌شود — نه به قلمِ نصب‌شده روی سیستمِ کاربر وابسته است، نه به Google Fonts. پیش از این
 * روی ویندوزِ بی‌وزیرمتن Segoe UI جایش می‌نشست و «ه» در وزنِ پررنگ شکسته (شبیهِ «ە») می‌شد.
 */
import '@fontsource-variable/vazirmatn';
import './globals.css';
// لایهٔ ظاهری (عمق، شیشه، حرکت) روی توکن‌ها و data-slotها — DESIGN.md، بخشِ «لایهٔ ظاهری».
import './visual-layer.css';

/**
 * ⚠️ `generateMetadata` به‌ازای هر درخواست اجرا می‌شود، پس مترجمِ درخواست در
 * دسترس است — برخلافِ `export const metadata` که سطحِ ماژول بود و توضیح را
 * در هر زبانی فارسی می‌گذاشت.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [t, brand] = await Promise.all([getT(), brandIdentity()]);
  // ⚠️ نسخه در نشانی: با عوض‌شدنِ لوگو یا نام، مرورگر آیکونِ تازه را می‌گیرد، نه کش را.
  const icon = (size: number) => `/brand-icon?size=${size}&v=${brand.version}`;
  return {
    // عنوانِ تب: «پروژه‌ها — نامِ برند»؛ صفحه‌ای که عنوان ندارد فقط نامِ برند.
    title: { default: brand.name, template: `%s — ${brand.name}` },
    applicationName: brand.name,
    icons: {
      icon: [
        { url: icon(32), sizes: '32x32', type: 'image/png' },
        { url: icon(192), sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: icon(180), sizes: '180x180', type: 'image/png' }],
    },
    description: t('سیستمِ مدیریتِ آژانس'),
    // PWA (۲.۵۴.۰) — آیفون مانیفست را برای نامِ آیکون و تمام‌صفحه بودن نمی‌خواند.
    appleWebApp: { capable: true, title: brand.name, statusBarStyle: 'default' },
    // ⚠️ اپِ داخلی است — هیچ صفحه‌ای (فاکتور، ورود) نباید در موتورِ جستجو بنشیند.
    robots: { index: false, follow: false },
  };
}

/** رنگِ نوارِ بالای مرورگر/اپِ نصب‌شده — همان رنگِ اصلی (PWA، ۲.۵۴.۰). */
export const viewport: Viewport = { themeColor: ICON_BACKGROUND };

/**
 * R-I18N-06 — جهت و زبان از **انتخابِ کاربر** مشتق می‌شوند، نه هاردکد.
 *
 * ⚠️ `dir` باید روی خودِ `<html>` بنشیند، نه یک div ِ درونی: منوهای شناور و
 * پیمایشِ مرورگر به جهتِ ریشه نگاه می‌کنند و با جهتِ داخلی هم‌گام نمی‌شوند.
 *
 * ⚠️ پیام‌ها یک بار اینجا خوانده و به کلاینت داده می‌شوند تا هر کامپوننتِ
 * کلاینت مجبور نباشد فایلِ زبان را خودش import کند.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // ⚠️ باید **اینجا** انجام شود: چیدمانِ ریشه پیش از هر فرزندی رندر می‌شود،
  // پس ترجمه برای کلِ درخت آماده است بی‌آنکه چیزی پاس داده شود.
  const { locale, messages } = await primeTranslations();
  const session = await currentSession();
  /*
   * منطقهٔ زمانیِ کاربرِ واردشده — تاریخ‌ها به وقتِ او نشان داده می‌شوند.
   *
   * ⚠️ ۳.۱۵.۱: کاربرِ بی منطقهٔ شخصی پیش از این `''` می‌گرفت؛ سرور با UTC رندر می‌کرد و گوشی با
   * منطقهٔ خودش (۰۷:۳۲ در برابرِ ۱۱:۰۲) — خطای ناهمخوانیِ React (#418) در «پیام‌ها» و پرشِ ساعت‌ها پس از
   * بارگذاری. حالا هر دو طرف منطقهٔ سامانه را می‌گیرند، و در نبودش UTC — همیشه یکسان.
   */
  let timeZone = session?.timezone ?? '';
  if (session && !timeZone) {
    timeZone = (await getSystemConfig().catch(() => null))?.timezone || 'UTC';
  }
  // ظاهرِ ذخیره‌شده روی کاربر (مهاجرتِ 0033) — روی هر دستگاهی یکسان.
  const appearance = session?.appearance ?? { theme: '' as const, palette: '' as const };

  return (
    <html lang={locale} dir={direction(locale)} suppressHydrationWarning>
      <head>
        {/* قبل از رندر اجرا می‌شود تا صفحه با رنگِ اشتباه چشمک نزند. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript(appearance) }} />
      </head>
      <body className="min-h-screen antialiased">
        {/*
          ⚠️ جهت برای Radix — `<html dir>` به کامپوننت‌های Radix نمی‌رسد و
          آن‌ها خودشان `dir="ltr"` می‌گذارند. بیرونی‌ترین لایه است تا منوها،
          دیالوگ‌ها و توست‌هایی که پورتال می‌شوند هم جهت را بگیرند.
        */}
        <DirectionProvider dir={direction(locale)}>
          <ThemeProvider initial={appearance} signedIn={session !== null}>
            <TranslationProvider locale={locale} messages={messages} timeZone={timeZone}>
              {/*
                ⚠️ توست در **ریشه** سوار می‌شود، نه در چیدمانِ اپ: صفحهٔ ورود،
                نصبِ اولیه و پوستهٔ عضوِ سابق (که چیدمانِ اپ را کنار می‌گذارد)
                هم فرم دارند و بازخوردشان نباید بی‌صدا بماند.
              */}
              <ToastProvider>
                {/* تأییدِ کارِ مخرب — یک دیالوگ برای همهٔ دکمه‌های حذف (پورتِ confirm()). */}
                <ConfirmProvider>
                  <ServiceWorkerRegister />
                  {children}
                </ConfirmProvider>
              </ToastProvider>
            </TranslationProvider>
          </ThemeProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
