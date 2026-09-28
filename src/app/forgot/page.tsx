import { publicBrand } from '@/server/setup/public-brand';
import { PublicShell } from '@/components/public-shell';
import { ForgotForm } from './forgot-form';

/** «رمزم را فراموش کرده‌ام» — عمومی، مثلِ صفحهٔ ورود. */
export default async function ForgotPage() {
  const brand = await publicBrand();
  return (
    <PublicShell brand={brand}>
      <ForgotForm />
    </PublicShell>
  );
}

export const dynamic = 'force-dynamic';
