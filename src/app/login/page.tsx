import { redirect } from 'next/navigation';
import { isInstalled } from '@/server/setup/service';
import { publicBrand } from '@/server/setup/public-brand';
import { PublicShell } from '@/components/public-shell';
import { LoginForm } from './login-form';
import { pageTitle } from '@/i18n/page-title';
import { safeNextPath } from '@/domain/auth/next-path';

export const generateMetadata = pageTitle('ورود به حساب');

/**
 * ⚠️ روی نصبِ تازه، به‌جای فرمِ ورود ویزارد باز می‌شود. بدونِ این، کاربر
 * صفحهٔ ورودی می‌دید که هیچ حسابی برایش وجود ندارد و راهی هم به نصب
 * نداشت — مگر اینکه آدرسِ `/setup` را حدس بزند.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; next?: string }> }) {
  if (!(await isInstalled())) redirect('/setup');
  const [{ reset, next }, brand] = await Promise.all([searchParams, publicBrand()]);
  return (
    <PublicShell brand={brand}>
      <LoginForm notice={reset === '1' ? 'رمزِ تازه ذخیره شد؛ اکنون وارد شوید.' : undefined} next={safeNextPath(next) === '/' ? undefined : safeNextPath(next)} />
    </PublicShell>
  );
}

export const dynamic = 'force-dynamic';
