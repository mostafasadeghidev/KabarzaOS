import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { accessBoard } from '@/server/access/service';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { AccessView } from './access-view';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell } from '@/components/page-shell';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('دسترسی‌ها');

/**
 * دفترِ دسترسی‌های بیرونی — «چه کسی به چه سامانه‌ای دسترسی دارد».
 *
 * ⚠️ همان گاردِ «اعضا» را دارد (`members.view` / `members.manage`): این
 * پروندهٔ پرسنلی است، نه تنظیماتِ سامانه.
 */
export default async function AccessPage({
  searchParams,
}: {
  /** `?user=` از منوی کارتِ عضو می‌آید تا فهرست روی همان شخص باز شود. */
  searchParams: Promise<{ user?: string }>;
}) {
  /**
   * ⚠️ هر صفحه **خودش** ترجمه را آماده می‌کند و به چیدمان تکیه نمی‌کند:
   * در ناوبریِ سمتِ کلاینت، Next فقط بخشِ صفحه را دوباره رندر می‌کند و
   * چیدمان را از درختِ کش‌شده برمی‌دارد.
   */
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  let data;
  try {
    data = await accessBoard(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader title={t("دسترسی‌ها")} />
          <EmptyState
            title={t("دسترسی ندارید")}
            description={t("دفترِ دسترسی‌ها برای کسی باز است که اعضا را می‌بیند.")}
          />
        </PageShell>
      );
    }
    throw error;
  }

  const focusUser = Number((await searchParams).user ?? 0) || null;
  const openCount = data.grants.filter((g) => g.revokedAt === null).length;

  return (
    <PageShell>
      <PageHeader
        title={t("دسترسی‌ها")}
        description={(
          <><span className="num">{openCount}</span>{' '}{t('دسترسیِ باز')}
          {' · '}
          <span className="num">{data.services.length}</span>{' '}{t('سرویس')}</>
        )}
      />

      <AccessView data={data} focusUser={focusUser} />
    </PageShell>
  );
}
