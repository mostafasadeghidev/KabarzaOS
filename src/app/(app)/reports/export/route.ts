import { currentActor } from '@/server/auth';
import { getT } from '@/i18n/server';
import {
  getAccountsReport, getAttendanceReport, getClientsReport, getExpensesReport,
  getHoursReport, getMembersReport, getProjectsReport, getUnitsReport,
} from '@/server/reports/service';
import { closingRows } from '@/server/finance/service';
import { visibleReportTabs } from '@/server/people/service';
import { ForbiddenError } from '@/domain/access/guard';
import {
  buildClosingCsv, buildReportCsv, EXPORT_FILENAMES, isExportableTab,
} from '@/domain/reports/export';

/**
 * خروجیِ CSV گزارش‌ها.و
 * `export_closing()`.
 *
 * ⚠️ تبِ **پنهانِ** RBAC همکاران اینجا هم پنهان است. بدونِ این، همکاری که تبِ
 * «اعضا» برایش پنهان شده بود می‌توانست همان داده را از آدرسِ خروجی بگیرد —
 * پنهان‌کردنِ تب در UI بدونِ گاردِ سرور، حریمی نمی‌سازد (R-RBAC-13).
 */
export async function GET(request: Request) {
  const actor = await currentActor();
  if (!actor) return new Response(null, { status: 403 });

  const params = new URL(request.url).searchParams;
  const tab = params.get('tab') ?? '';

  try {
    const visible = await visibleReportTabs(actor);

    // ── دورهٔ بستهٔ مالی ────────────────────────────────────────────────
    if (tab === 'closings') {
      if (!visible.includes('closings')) return new Response(null, { status: 403 });
      const date = params.get('date') ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response(null, { status: 400 });

      return csvResponse(
        buildClosingCsv(await closingRows(actor, date), await getT()),
        `kabarza-closing-${date}.csv`,
        `بستنِ-دوره-${date}.csv`,
      );
    }

    if (!isExportableTab(tab)) return new Response(null, { status: 400 });
    if (!visible.includes(tab)) return new Response(null, { status: 403 });

    /**
     * ⚠️ فقط دادهٔ همان تب خوانده می‌شود، نه کلِ صفحه: خروجیِ «ساعت کاری»
     * نباید دَه کوئریِ مالی بزند.
     */
    const data = {
      members: tab === 'members' ? await getMembersReport(actor) : [],
      clients: tab === 'clients' ? await getClientsReport(actor) : [],
      expenses: tab === 'expenses'
        ? await getExpensesReport(actor)
        : { totalIn: '0', totalOut: '0', rows: [] },
      accountsReport: tab === 'accounts' ? await getAccountsReport(actor) : [],
      hours: tab === 'hours' ? await getHoursReport(actor) : [],
      projectRows: tab === 'projects' ? await getProjectsReport(actor) : [],
      units: tab === 'units' ? await getUnitsReport(actor) : [],
      attendance: tab === 'attendance'
        ? await getAttendanceReport(actor)
        : { leaves: [], withoutSchedule: [] },
    };

    return csvResponse(buildReportCsv(tab, data, await getT()), EXPORT_FILENAMES[tab], EXPORT_FILENAMES[tab]);
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    throw error;
  }
}

function csvResponse(csv: string, asciiName: string, prettyName: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // نامِ فارسی طبقِ RFC 6266 کدگذاری می‌شود (R-FILE-11).
      'Content-Disposition':
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(prettyName)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
