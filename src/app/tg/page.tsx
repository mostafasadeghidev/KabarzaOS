import { primeTranslations } from '@/i18n/server';
import { pageTitle } from '@/i18n/page-title';
import { publicBrand } from '@/server/setup/public-brand';
import { PublicShell } from '@/components/public-shell';
import { safeNextPath } from '@/domain/auth/next-path';
import { MiniAppLogin } from './mini-app-login';

export const generateMetadata = pageTitle('ورود از تلگرام');
export const dynamic = 'force-dynamic';

/**
 * `GET /tg` — درِ ورودِ مینی‌اپِ تلگرام (۲.۱۰.۰). ربات این نشانی را در دکمهٔ
 * «باز کردنِ برنامه» می‌گذارد؛ صفحه امضای تلگرام را به سرور می‌دهد و بعد به
 * `next` (فقط مسیرِ داخلی) می‌رود.
 */
export default async function TelegramMiniAppPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await primeTranslations();
  const { next } = await searchParams;
  return (
    <PublicShell brand={await publicBrand()}>
      <MiniAppLogin next={safeNextPath(next)} />
    </PublicShell>
  );
}
