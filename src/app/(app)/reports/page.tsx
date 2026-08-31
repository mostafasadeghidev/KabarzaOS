import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import {
  getAccountsReport, getAttendanceReport, getClientsReport, getExpensesReport,
  getHoursReport, getMembersReport, getOverall, getProjectsReport, getUnitsReport,
} from '@/server/reports/service';
import { closingDates, closingRows } from '@/server/finance/service';
import { visibleReportTabs } from '@/server/people/service';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportsView } from './reports-view';
import { t } from '@/i18n/server';

/** گزارش‌ها — همهٔ اعداد در ارزِ پایه و از ستون‌های منجمد. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string }>;
}) {
  const actor = await currentActor();
  if (!actor) redirect('/login');

  const query = await searchParams;

  try {
    const [
      tabs, overall, members, clients, expenses, accountsReport, hours,
      projectRows, units, attendance, dates,
    ] = await Promise.all([
      visibleReportTabs(actor),
      getOverall(actor),
      getMembersReport(actor),
      getClientsReport(actor),
      getExpensesReport(actor),
      getAccountsReport(actor),
      getHoursReport(actor),
      getProjectsReport(actor),
      getUnitsReport(actor),
      getAttendanceReport(actor),
      // ⚠️ فقط تاریخ‌ها؛ ردیف‌های هر دوره پس از انتخابِ کاربر خوانده می‌شوند.
      closingDates(actor).catch(() => [] as string[]),
    ]);

    /**
     * تازه‌ترین دوره پیش‌فرض باز است — معمولاً همان چیزی است که می‌خواهند.
     * ⚠️ تاریخِ درخواستی باید در فهرستِ واقعی باشد؛ رشتهٔ دلخواهِ نشانی
     * مستقیم به کوئری نمی‌رود.
     */
    const requested = query.date && dates.includes(query.date) ? query.date : dates[0] ?? null;
    const closings = requested
      ? { dates, active: requested, rows: await closingRows(actor, requested) }
      : { dates, active: null, rows: [] };

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
          data={{
          isOwner: actor.roles.includes('owner'),
            overall, members, clients, expenses, accountsReport, hours,
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
