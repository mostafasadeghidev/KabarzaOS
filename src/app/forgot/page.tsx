import { publicBrand } from '@/server/setup/public-brand';
import { PublicShell } from '@/components/public-shell';
import { ForgotForm } from './forgot-form';
import { pageTitle } from '@/i18n/page-title';
import { publicTurnstileSiteKey } from '@/server/settings/turnstile-service';

export const generateMetadata = pageTitle('بازنشانیِ رمزِ عبور');

/** «رمزم را فراموش کرده‌ام» — عمومی، مثلِ صفحهٔ ورود. */
export default async function ForgotPage() {
  const [brand, turnstileSiteKey] = await Promise.all([publicBrand(), publicTurnstileSiteKey()]);
  return (
    <PublicShell brand={brand}>
      <ForgotForm turnstileSiteKey={turnstileSiteKey} />
    </PublicShell>
  );
}

export const dynamic = 'force-dynamic';
