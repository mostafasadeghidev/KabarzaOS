import { redirect } from 'next/navigation';
import { isInstalled } from '@/server/setup/service';
import { publicBrand } from '@/server/setup/public-brand';
import { PublicShell } from '@/components/public-shell';
import { SetupForm } from './setup-form';

/**
 * ⚠️ گاردِ سرور، نه فقط پنهان‌کردنِ لینک: اگر سامانه نصب شده باشد این
 * صفحه اصلاً رندر نمی‌شود. خودِ اکشن هم مستقل بررسی می‌کند (R-ARCH-01) —
 * دو سدّ، چون این تنها جایی است که بدونِ احراز هویت کاربر ساخته می‌شود.
 */
export default async function SetupPage() {
  if (await isInstalled()) redirect('/login');
  // پیش از نصب شرکتی ثبت نشده؛ برندِ پیش‌فرض (KabarzaOS) می‌آید.
  const brand = await publicBrand();
  return (
    <PublicShell brand={brand} width="lg">
      <SetupForm />
    </PublicShell>
  );
}

export const dynamic = 'force-dynamic';
