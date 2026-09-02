import Link from 'next/link';
import { ResetForm } from './reset-form';
import { t } from '@/i18n/server';
import { primeTranslations } from '@/i18n/server';

/** تعیینِ رمز از راهِ لینکِ ایمیل — عمومی، مثلِ صفحهٔ ورود. */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  await primeTranslations();
  const { token } = await searchParams;
  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm space-y-3 text-center text-sm">
          <p>{t("این لینک کامل نیست.")}</p>
          <Link href="/forgot" className="underline">{t("درخواستِ لینکِ تازه")}</Link>
        </div>
      </main>
    );
  }
  return <ResetForm token={token} />;
}

export const dynamic = 'force-dynamic';
