import Link from 'next/link';
import { ResetForm } from './reset-form';
import { t } from '@/i18n/server';
import { primeTranslations } from '@/i18n/server';
import { publicBrand } from '@/server/setup/public-brand';
import { PublicShell } from '@/components/public-shell';
import { Card, CardContent } from '@/components/ui/card';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('تعیینِ رمزِ عبور');

/** تعیینِ رمز از راهِ لینکِ ایمیل — عمومی، مثلِ صفحهٔ ورود. */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await primeTranslations();
  const [{ token }, brand] = await Promise.all([searchParams, publicBrand()]);
  if (!token) {
    return (
      <PublicShell brand={brand}>
        <Card>
          <CardContent className="grid gap-3 text-center text-sm">
            <p>{t("این لینک کامل نیست.")}</p>
            <Link href="/forgot" className="underline underline-offset-4">{t("درخواستِ لینکِ تازه")}</Link>
          </CardContent>
        </Card>
      </PublicShell>
    );
  }
  return (
    <PublicShell brand={brand}>
      <ResetForm token={token} />
    </PublicShell>
  );
}

export const dynamic = 'force-dynamic';
