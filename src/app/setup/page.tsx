import { redirect } from 'next/navigation';
import { isInstalled } from '@/server/setup/service';
import { SetupForm } from './setup-form';

/**
 * ⚠️ گاردِ سرور، نه فقط پنهان‌کردنِ لینک: اگر سامانه نصب شده باشد این
 * صفحه اصلاً رندر نمی‌شود. خودِ اکشن هم مستقل بررسی می‌کند (R-ARCH-01) —
 * دو سدّ، چون این تنها جایی است که بدونِ احراز هویت کاربر ساخته می‌شود.
 */
export default async function SetupPage() {
  if (await isInstalled()) redirect('/login');
  return <SetupForm />;
}

export const dynamic = 'force-dynamic';
