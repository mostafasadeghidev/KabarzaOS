import { redirect } from 'next/navigation';
import { isInstalled } from '@/server/setup/service';
import { publicBrand } from '@/server/setup/public-brand';
import { PublicShell } from '@/components/public-shell';
import { LoginForm } from './login-form';

/**
 * ⚠️ روی نصبِ تازه، به‌جای فرمِ ورود ویزارد باز می‌شود. بدونِ این، کاربر
 * صفحهٔ ورودی می‌دید که هیچ حسابی برایش وجود ندارد و راهی هم به نصب
 * نداشت — مگر اینکه آدرسِ `/setup` را حدس بزند.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (!(await isInstalled())) redirect('/setup');
  const [{ reset }, brand] = await Promise.all([searchParams, publicBrand()]);
  return (
    <PublicShell brand={brand}>
      <LoginForm notice={reset === '1' ? 'رمزِ تازه ذخیره شد؛ اکنون وارد شوید.' : undefined} />
    </PublicShell>
  );
}

export const dynamic = 'force-dynamic';
