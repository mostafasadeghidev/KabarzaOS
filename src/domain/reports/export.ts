import { csvDocument } from '@/domain/access/office-scope';
import { createTranslator, type Translator } from '@/i18n/translate';
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

/** بدونِ مترجم همان فارسیِ مبدأ برمی‌گردد — کلید خودِ متنِ فارسی است. */
const SOURCE: Translator = createTranslator({});

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

/**
 * ⚠️ سرستون‌ها **ترجمه می‌شوند** — با مترجمِ درخواست (`getT()` در route). پیش از
 * این در هر زبانی فارسی می‌رفتند. بدونِ مترجم همان فارسیِ مبدأ برمی‌گردد،
 * پس تستِ شکلِ فایل دست‌نخورده می‌ماند.
 */
export function buildReportCsv(tab: ExportableTab, data: ReportExportData, t: Translator = SOURCE): string {
  switch (tab) {
    case 'members':
      return csvDocument(
        [t('عضو'), t('تعهد (یورو)'), t('پرداخت‌شده (یورو)'), t('بدهی (یورو)'), t('ساعت کاری')],
        data.members.map((r) => [r.name, r.agreed, r.paid, r.remaining, hoursLabel(r.minutes)]),
      );

    case 'clients':
      return csvDocument(
        [t('کارفرما'), t('پروژه‌ها'), t('ارزشِ کل (یورو)'), t('دریافتیِ کل (یورو)'), t('مانده (یورو)')],
        data.clients.map((r) => [r.name, r.projectCount, r.price, r.paid, r.due]),
      );

    case 'expenses':
      return csvDocument(
        [t('تاریخ'), t('شرح'), t('حساب'), t('جهت'), t('مبلغ (یورو)')],
        [
          ...data.expenses.rows.map((r) => [
            r.entryDate, r.description, r.accountName ?? '',
            r.direction === 'in' ? t('ورودی') : t('خروجی'), r.amountEur,
          ]),
          // ⚠️ سطرِ جمع مثلِ نسخهٔ قبلی ته فایل می‌آید، نه در سربرگ.
          [t('مجموعِ ورودی'), '', '', '', data.expenses.totalIn],
          [t('مجموعِ خروجی'), '', '', '', data.expenses.totalOut],
        ],
      );

    case 'accounts':
      return csvDocument(
        [t('حساب'), t('ارز'), t('مانده اول دوره'), t('ورودی'), t('خروجی'), t('مانده')],
        data.accountsReport.map((r) => [
          r.name, r.currencyCode ?? '', r.opening, r.totalIn, r.totalOut, r.balance,
        ]),
      );

    case 'hours':
      return csvDocument(
        [t('پروژه'), t('دقیقه'), t('ساعت کاری')],
        data.hours.map((r) => [r.title, r.minutes, hoursLabel(r.minutes)]),
      );

    case 'projects':
      return csvDocument(
        [
          t('پروژه'), t('وضعیت'), t('قیمت (یورو)'), t('دریافتی (یورو)'), t('طلب (یورو)'),
          t('هزینهٔ تیم (یورو)'), t('سود تخمینی (یورو)'), t('ساعت کاری'),
        ],
        data.projectRows.map((r) => [
          r.title, r.statusName ?? '', r.price, r.clientPaid, r.clientDue,
          r.memberPaid, r.profit, hoursLabel(r.minutes),
        ]),
      );

    case 'units':
      return csvDocument(
        [t('عضو'), t('پرداخت‌شده (یورو)'), t('پرداخت‌نشده (یورو)'), t('مجموع (یورو)')],
        data.units.map((r) => [r.name, r.paid, r.unpaid, r.total]),
      );

    case 'attendance':
      return csvDocument(
        [t('عضو'), t('از'), t('تا'), t('دلیل')],
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
}>, t: Translator = SOURCE): string {
  return csvDocument(
    [
      t('حساب'), t('ارز'), t('شروعِ دوره'), t('واریز'), t('برداشت'), t('ماندهٔ پایان'),
      t('دریافت از کارفرما (یورو)'), t('پرداخت به تیم (یورو)'), t('هزینه (یورو)'), t('ماندهٔ پایان (یورو)'),
    ],
    rows.map((r) => [
      r.accountName, r.currencyCode ?? '', r.periodStart, r.deposits, r.withdrawals,
      r.closingBalance, r.clientReceivedEur, r.memberPaidEur, r.expensesEur, r.closingBalanceEur,
    ]),
  );
}
