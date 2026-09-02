'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useT } from '@/i18n/client';

/**
 * مرزِ خطای برنامه.
 *
 * ⚠️ چرا لازم است، با یک نمونهٔ واقعی: وقتی شِمای دیتابیس از کد عقب بماند
 * (مهاجرتِ اجرانشده)، کوئری با «ستون وجود ندارد» می‌افتد. آن خطا
 * `NotFoundError` نیست، پس صفحه دوباره پرتابش می‌کند و کاربر صفحهٔ خامِ
 * Next را می‌دید — که شبیهِ «پروژه‌ام گم شد» است، نه شبیهِ «سرور خراب است».
 * تشخیصِ درست از همین‌جا شروع می‌شود.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // ⚠️ لاگِ سمتِ کلاینت: digest تنها رشته‌ای است که به لاگِ سرور وصلش می‌کند.
    console.error('[app-error]', error.digest ?? '', error.message);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-medium">{t('چیزی درست پیش نرفت.')}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t('خطا ثبت شد. اگر تکرار شد، این شناسه را به مدیر بدهید:')}
      </p>
      {error.digest && <code className="num text-xs text-muted-foreground">{error.digest}</code>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {t('تلاشِ دوباره')}
        </button>
        <Link
          href="/"
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          {t('بازگشت به خانه')}
        </Link>
      </div>
    </main>
  );
}
