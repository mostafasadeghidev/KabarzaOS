import Link from 'next/link';
import { primeTranslations, t } from '@/i18n/server';

/**
 * ۴۰۴ ِ خودِ برنامه.
 *
 * ⚠️ تا پیش از این هیچ مرزِ خطایی در `src/app` نبود — نه `not-found`، نه
 * `error`. هر آدرسِ نادرست صفحهٔ خامِ Next را می‌داد: پس‌زمینهٔ سفید، جملهٔ
 * انگلیسی، بدونِ پوستهٔ برنامه و **بدونِ هیچ لینکی برای برگشتن**. گزارشِ
 * کاربر هم دقیقاً همین بود: «۴۰۴ می‌دهد» — نه اینکه آدرس اشتباه است، که
 * راهِ برگشتی نمی‌ماند.
 */
export default async function NotFound() {
  await primeTranslations();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="num text-4xl font-semibold text-muted-foreground">404</p>
      <h1 className="text-lg font-medium">{t('این صفحه پیدا نشد.')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t('ممکن است پاک شده باشد، یا دسترسی‌اش را نداشته باشید.')}
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {t('بازگشت به خانه')}
      </Link>
    </main>
  );
}
