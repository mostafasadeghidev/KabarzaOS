import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n/server';
import type { BucketStatus } from '@/domain/files/probe';

/**
 * هشدارِ مالک: باکتِ فایل‌ها باز است یا وضعیتش معلوم نیست — پورتِ
 * `Private_Files::admin_notice()` که روی همهٔ صفحه‌های مدیریت می‌آمد.
 * ⚠️ فقط مالک، و فقط وقتی «محافظت‌شده» نیست؛ راهنما و «بررسی دوباره» در
 * تبِ «سامانه» ی تنظیمات است.
 */
export function BucketWarning({ status }: { status: Exclude<BucketStatus, 'protected'> }) {
  const exposed = status === 'exposed';
  return (
    <div
      role="alert"
      className={exposed
        ? 'flex flex-wrap items-center gap-2 border-b border-red-500/40 bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300'
        : 'flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'}
    >
      <ShieldAlert className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {exposed
          ? t('هشدارِ امنیتی: فایل‌های خصوصی (رسیدها، قراردادها) بدونِ ورود هم خوانده می‌شوند.')
          : t('وضعیتِ محافظتِ فایل‌های خصوصی قابلِ بررسی نبود.')}
      </span>
      <Button asChild size="sm" variant="outline" className="h-7">
        <Link href="/settings?tab=system">{t('راهنما و بررسی دوباره')}</Link>
      </Button>
    </div>
  );
}
