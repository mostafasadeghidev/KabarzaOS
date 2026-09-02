import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import {
  filterOffices, getAccountsReport, getAttendanceReport, getClientsReport, getExpensesReport,
  getHoursReport, getMembersReport, getOverall, getProjectsReport, getUnitsReport,
  reportClosingDates, reportClosingRows,
} from '@/server/reports/service';
import { currentLockDate } from '@/server/finance/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { can } from '@/domain/access/permissions';
import {
  expensePresets, expenseRange, hoursPresets, hoursRange, parseIds,
} from '@/domain/reports/filters';
import { visibleReportTabs } from '@/server/people/service';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportsView } from './reports-view';
import { primeTranslations, t } from '@/i18n/server';

/** گزارش‌ها — همهٔ اعداد در ارزِ پایه و از ستون‌های منجمد. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string; date?: string;
    /** فیلترِ دفتر — تکراری (`office=1&office=2`). */
    office?: string | string[];
    /** بازهٔ تبِ هزینه‌ها. */
    from?: string; to?: string;
    /** بازهٔ تبِ ساعت — جدا تا با هزینه‌ها قاطی نشود. */
    hfrom?: string; hto?: string;
  }>;
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

  const query = await searchParams;

  // پورتِ فیلترهای افزونه: دفتر (چندتایی)، بازهٔ هزینه‌ها (پیش‌فرض این ماه)،
  // بازهٔ ساعت (پیش‌فرض این هفته از روزِ شروعِ تنظیمات).
  const today = new Date().toISOString().slice(0, 10);
  const { weekStart } = await getSystemConfig();
  const officeIds = parseIds(query.office);
  const expenses = expenseRange({ from: query.from, to: query.to }, today);
  const hours = hoursRange({ from: query.hfrom, to: query.hto }, today, weekStart);
  const filters = {
    officeIds,
    offices: await filterOffices(),
    expenses: { range: expenses, presets: expensePresets(today) },
    hours: { range: { from: hours.from, to: hours.to }, allTime: hours.allTime, presets: hoursPresets(today, weekStart) },
  };

  try {
    const [
      tabs, overall, members, clients, expensesReport, accountsReport, hoursReport,
      projectRows, units, attendance, dates,
    ] = await Promise.all([
      visibleReportTabs(actor),
      getOverall(actor, { officeIds }),
      getMembersReport(actor, { officeIds }),
      getClientsReport(actor, { officeIds }),
      getExpensesReport(actor, expenses),
      getAccountsReport(actor),
      getHoursReport(actor, { officeIds, from: hours.from, to: hours.to }),
      getProjectsReport(actor, { officeIds }),
      getUnitsReport(actor),
      getAttendanceReport(actor),
      // ⚠️ فقط تاریخ‌ها؛ ردیف‌های هر دوره پس از انتخابِ کاربر خوانده می‌شوند.
      reportClosingDates(actor),
    ]);

    /**
     * تازه‌ترین دوره پیش‌فرض باز است — معمولاً همان چیزی است که می‌خواهند.
     * ⚠️ تاریخِ درخواستی باید در فهرستِ واقعی باشد؛ رشتهٔ دلخواهِ نشانی
     * مستقیم به کوئری نمی‌رود.
     */
    const requested = query.date && dates.includes(query.date) ? query.date : dates[0] ?? null;
    const lockDate = await currentLockDate();
    const closings = requested
      ? { dates, active: requested, rows: await reportClosingRows(actor, requested), lockDate }
      : { dates, active: null, rows: [], lockDate };

    return (
      <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
        <header>
          <h1 className="text-xl font-semibold">{t("گزارش‌ها")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("همهٔ مبالغ در ارزِ پایه و بر مبنای نرخِ لحظهٔ ثبت.")}
          </p>
        </header>

        <ReportsView
          tabs={tabs}
          initialTab={query.tab ?? null}
          filters={filters}
          data={{
            // ترمیمِ یورو: مالک یا مدیرِ مالی؛ پیوندِ پروژه فقط برای مدیرِ پروژه‌ها (پورتِ افزونه).
            canRecompute: actor.roles.includes('owner') || can(actor, 'finance.manage'),
            canManageProjects: actor.roles.includes('owner') || can(actor, 'projects.manage'),
            overall, members, clients, expenses: expensesReport, accountsReport, hours: hoursReport,
            projectRows, units, attendance, closings,
          }}
        />
      </main>
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <main className="p-6">
          <EmptyState title={t("دسترسی ندارید")} description={t("برای دیدنِ گزارش‌ها از مدیر دسترسی بگیرید.")} />
        </main>
      );
    }
    throw error;
  }
}
