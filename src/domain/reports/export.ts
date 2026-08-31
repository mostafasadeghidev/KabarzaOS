import { csvDocument } from '@/domain/access/office-scope';
import { hoursLabel } from '@/domain/reports/summary';

/**
 * ستون‌های خروجیِ CSV هر تبِ گزارش — پورتِ
 *.
 *
 * ⚠️ چرا دامنه و نه داخلِ route: شکلِ ستون‌ها **قرارداد** است، نه جزئیاتِ
 * پیاده‌سازی. کسی که فایل را در اکسل باز می‌کند و ستون‌ها جابه‌جا شده‌اند،
 * فرمول‌هایش می‌شکند. تستِ کنارِ این فایل شکل را قفل می‌کند.
 *
 * ⚠️ عددها **رشته** می‌مانند (R-MONEY-01): تبدیل به `number` گِردکردنِ
 * ممیزِ شناور می‌آورد و مبلغِ روی فایل با مبلغِ روی صفحه یکی نمی‌ماند.
 */

export const EXPORTABLE_TABS = [
  'members', 'clients', 'expenses', 'accounts', 'hours', 'projects', 'units', 'attendance',
] as const;

export type ExportableTab = (typeof EXPORTABLE_TABS)[number];

export function isExportableTab(value: string): value is ExportableTab {
  return (EXPORTABLE_TABS as readonly string[]).includes(value);
}

/** نامِ فایل — همان الگوی نسخهٔ قبلی (…`, اینجا `kabarza-…`). */
export const EXPORT_FILENAMES: Record<ExportableTab, string> = {
  members: 'kabarza-member-debts.csv',
  clients: 'kabarza-client-receivables.csv',
  expenses: 'kabarza-expenses.csv',
  accounts: 'kabarza-accounts.csv',
  hours: 'kabarza-hours.csv',
  projects: 'kabarza-projects.csv',
  units: 'kabarza-unit-earnings.csv',
  attendance: 'kabarza-attendance.csv',
};

export interface ReportExportData {
  members: Array<{ name: string; agreed: string; paid: string; remaining: string; minutes: number }>;
  clients: Array<{
    name: string; projectCount: number; price: string; paid: string; due: string;
  }>;
  expenses: {
    totalIn: string;
    totalOut: string;
    rows: Array<{
      entryDate: string; description: string; direction: string;
      amountEur: string; accountName: string | null;
    }>;
  };
  accountsReport: Array<{
    name: string; currencyCode: string | null;
    opening: string; totalIn: string; totalOut: string; balance: string;
  }>;
  hours: Array<{ title: string; minutes: number }>;
  projectRows: Array<{
    title: string; statusName: string | null; price: string;
    clientPaid: string; clientDue: string; memberPaid: string; profit: string; minutes: number;
  }>;
  units: Array<{ name: string; paid: string; unpaid: string; total: string }>;
  attendance: {
    leaves: Array<{ name: string; fromDate: string; toDate: string; note: string }>;
  };
}

export function buildReportCsv(tab: ExportableTab, data: ReportExportData): string {
  switch (tab) {
    case 'members':
      return csvDocument(
        ['عضو', 'تعهد (یورو)', 'پرداخت‌شده (یورو)', 'بدهی (یورو)', 'ساعت کاری'],
        data.members.map((r) => [r.name, r.agreed, r.paid, r.remaining, hoursLabel(r.minutes)]),
      );

    case 'clients':
      return csvDocument(
        ['کارفرما', 'پروژه‌ها', 'ارزشِ کل (یورو)', 'دریافتیِ کل (یورو)', 'مانده (یورو)'],
        data.clients.map((r) => [r.name, r.projectCount, r.price, r.paid, r.due]),
      );

    case 'expenses':
      return csvDocument(
        ['تاریخ', 'شرح', 'حساب', 'جهت', 'مبلغ (یورو)'],
        [
          ...data.expenses.rows.map((r) => [
            r.entryDate, r.description, r.accountName ?? '',
            r.direction === 'in' ? 'ورودی' : 'خروجی', r.amountEur,
          ]),
          // ⚠️ سطرِ جمع مثلِ نسخهٔ قبلی ته فایل می‌آید، نه در سربرگ.
          ['مجموعِ ورودی', '', '', '', data.expenses.totalIn],
          ['مجموعِ خروجی', '', '', '', data.expenses.totalOut],
        ],
      );

    case 'accounts':
      return csvDocument(
        ['حساب', 'ارز', 'مانده اول دوره', 'ورودی', 'خروجی', 'مانده'],
        data.accountsReport.map((r) => [
          r.name, r.currencyCode ?? '', r.opening, r.totalIn, r.totalOut, r.balance,
        ]),
      );

    case 'hours':
      return csvDocument(
        ['پروژه', 'دقیقه', 'ساعت کاری'],
        data.hours.map((r) => [r.title, r.minutes, hoursLabel(r.minutes)]),
      );

    case 'projects':
      return csvDocument(
        [
          'پروژه', 'وضعیت', 'قیمت (یورو)', 'دریافتی (یورو)', 'طلب (یورو)',
          'هزینهٔ تیم (یورو)', 'سود تخمینی (یورو)', 'ساعت کاری',
        ],
        data.projectRows.map((r) => [
          r.title, r.statusName ?? '', r.price, r.clientPaid, r.clientDue,
          r.memberPaid, r.profit, hoursLabel(r.minutes),
        ]),
      );

    case 'units':
      return csvDocument(
        ['عضو', 'پرداخت‌شده (یورو)', 'پرداخت‌نشده (یورو)', 'مجموع (یورو)'],
        data.units.map((r) => [r.name, r.paid, r.unpaid, r.total]),
      );

    case 'attendance':
      return csvDocument(
        ['عضو', 'از', 'تا', 'دلیل'],
        data.attendance.leaves.map((r) => [r.name, r.fromDate, r.toDate, r.note]),
      );
  }
}

/** خروجیِ یک دورهٔ بستهٔ مالی — پورتِ `export_closing()`. */
export function buildClosingCsv(rows: Array<{
  accountName: string; currencyCode: string | null; periodStart: string;
  deposits: string; withdrawals: string; closingBalance: string;
  clientReceivedEur: string; memberPaidEur: string; expensesEur: string;
  closingBalanceEur: string;
}>): string {
  return csvDocument(
    [
      'حساب', 'ارز', 'شروعِ دوره', 'واریز', 'برداشت', 'ماندهٔ پایان',
      'دریافت از کارفرما (یورو)', 'پرداخت به تیم (یورو)', 'هزینه (یورو)', 'ماندهٔ پایان (یورو)',
    ],
    rows.map((r) => [
      r.accountName, r.currencyCode ?? '', r.periodStart, r.deposits, r.withdrawals,
      r.closingBalance, r.clientReceivedEur, r.memberPaidEur, r.expensesEur, r.closingBalanceEur,
    ]),
  );
}
