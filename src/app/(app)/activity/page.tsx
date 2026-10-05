import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { ACTIVITY_PER_PAGE, actionLabel, listActivity } from '@/server/activity/service';
import { ForbiddenError } from '@/domain/access/guard';
import { hasTeamAvailability } from '@/server/availability/service';
import { ActivityView } from './activity-view';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell } from '@/components/page-shell';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('رویدادها');

/**
 * «رویدادها» — از همان لاگِ ممیزی که هر سرویس در آن می‌نویسد (`activity.view`).
 *
 * ⚠️ تب‌های قدیمیِ این صفحه جابه‌جا شدند (۲.۲.۰) و پیوندهای کهنه — اعلان‌ها،
 * نشانک‌ها — به جای تازه‌شان می‌روند: برنامه و مرخصیِ خود → «برنامهٔ من»،
 * مرخصی‌های تیم → «حضور و مرخصیِ تیم». کسی هم که مجوزِ رویدادها ندارد به
 * «برنامهٔ من» می‌رود، نه به صفحهٔ «دسترسی ندارید».
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const query = await searchParams;
  if (query.tab === 'availability') redirect('/my-schedule');
  if (query.tab === 'absences') redirect((await hasTeamAvailability(actor)) ? '/availability' : '/my-schedule');

  const page = Math.max(1, Number(query.page ?? 1) || 1);
  let feed;
  try {
    feed = await listActivity(actor, { page });
  } catch (error) {
    if (error instanceof ForbiddenError) redirect('/my-schedule');
    throw error;
  }

  return (
    <PageShell>
      <PageHeader
        title={t("رویدادها")}
        description={t("آخرین رویدادهای سامانه — چه کسی، چه کاری، روی چه چیزی.")}
      />

      <ActivityView
        events={feed.rows.map((r) => ({ ...r, label: actionLabel(r.action) }))}
        paging={{
          page: feed.page,
          totalPages: feed.totalPages,
          total: feed.total,
          perPage: feed.perPage ?? ACTIVITY_PER_PAGE,
        }}
      />
    </PageShell>
  );
}
