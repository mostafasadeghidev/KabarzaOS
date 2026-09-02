import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import {
  canLogGeneral, canUseTimesheet, loggableProjects, loggedProjectTitles, myLogs, myTotals, timerState,
} from '@/server/timelogs/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { EmptyState } from '@/components/ui/empty-state';
import { toDateString } from '@/domain/timelogs/timer';
import { hasHoursFilter, parseHoursFilter } from '@/domain/timelogs/hours-filter';
import { HoursView } from './hours-view';
import { primeTranslations, t } from '@/i18n/server';

/** ساعتِ کاری — تایمر، ثبتِ دستی و فهرستِ ثبت‌های خودِ کاربر (پورتِ `view_hours`). */
export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; project?: string; page?: string }>;
}) {
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

  /**
   * ⚠️ گاردِ مستقلِ صفحه (R-ARCH-01): پنهان‌بودنِ آیتمِ منو گارد نیست.
   * پورتِ افزونه: هر که ساعتِ عمومی یا پروژه‌ای می‌تواند بزند (عضو، مالک، مالی، مدیرِ دفتر).
   */
  if (!await canUseTimesheet(actor)) {
    return (
      <main className="p-6">
        <EmptyState
          title={t("این بخش برای اعضای تیم است")}
          description={t("ثبتِ ساعت کارِ اعضاست؛ ساعتِ تیم را در «تیمِ من» و گزارش‌ها می‌بینید.")}
        />
      </main>
    );
  }

  const now = new Date();
  const filter = parseHoursFilter(await searchParams);
  const { weekStart } = await getSystemConfig();
  const [state, projects, logs, totals, projectTitles] = await Promise.all([
    timerState(actor, now),
    loggableProjects(actor),
    myLogs(actor, { from: filter.from, to: filter.to, project: filter.project, page: filter.page }, now),
    myTotals(actor, now, weekStart),
    loggedProjectTitles(actor),
  ]);

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("ساعت کاری")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("تایمر روی سرور می‌شمارد؛ بستنِ مرورگر چیزی را از بین نمی‌برد.")}
          </p>
        </div>
        {/* پورتِ یادداشتِ سربرگِ افزونه. */}
        <span className="text-xs text-muted-foreground">{t("ساعت‌های ثبت‌شده تا ۲ هفته قابل ویرایش‌اند.")}</span>
      </header>

      <HoursView
        data={{
          running: state.running,
          pending: state.pending,
          projects,
          logs: logs.rows,
          pager: { page: logs.page, pages: logs.pages, total: logs.total },
          rangeMinutes: hasHoursFilter(filter) ? logs.rangeMinutes : null,
          filter: { from: filter.from, to: filter.to, project: filter.project },
          projectTitles,
          totals: { week: totals.week, month: totals.month },
          canLogGeneral: canLogGeneral(actor),
          today: toDateString(now),
        }}
      />
    </main>
  );
}
