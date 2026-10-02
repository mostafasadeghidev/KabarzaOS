import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { myOpenCommentThreads } from '@/server/projects/service';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell } from '@/components/page-shell';
import { CommentThreads } from '../team/review-panel';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('کامنت‌های نیازمند بررسی');

/**
 * «کامنت‌های نیازمند بررسی» — پورتِ `view_thread_list( 'comment' )`: رشته‌های
 * بازِ پروژه‌هایی که عضو یا کارفرمایشان هستید، با آخرین پیام و پیوند به تبِ
 * کامنت‌های همان پروژه. مقصدِ کارتِ داشبوردِ عضو و کارفرما.
 */
export default async function CommentsPage() {
  /**
   * ⚠️ هر صفحه **خودش** ترجمه را آماده می‌کند و به چیدمان تکیه نمی‌کند:
   * در ناوبریِ سمتِ کلاینت، Next فقط بخشِ صفحه را دوباره رندر می‌کند و
   * چیدمان را از درختِ کش‌شده برمی‌دارد — پس `primeTranslations()` ِ
   * چیدمان اجرا نمی‌شود و `t()` رشتهٔ فارسیِ مبدأ را برمی‌گرداند.
   * `cache()` تضمین می‌کند در هر درخواست فقط یک بار اجرا شود.
   */
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const threads = await myOpenCommentThreads(actor);

  return (
    <PageShell>
      <PageHeader
        back={{ href: '/dashboard', label: t('بازگشت به داشبورد') }}
        title={t('کامنت‌های نیازمند بررسی')}
      />
      <CommentThreads threads={threads} reply={false} />
    </PageShell>
  );
}
