import { describe, expect, it } from 'vitest';
import {
  buildClosingCsv, buildReportCsv, EXPORT_FILENAMES, EXPORTABLE_TABS, isExportableTab,
  type ReportExportData,
} from './export';

/**
 * ⚠️ این تست شکلِ **قرارداد** را قفل می‌کند، نه پیاده‌سازی را. کسی که فایل را
 * در اکسل باز کرده و روی ستون‌ها فرمول نوشته، با جابه‌جاییِ یک ستون کارش
 * می‌شکند — و هیچ خطایی هم نمی‌بیند.
 */

const data: ReportExportData = {
  members: [{ name: 'سارا', agreed: '1000.00', paid: '400.00', remaining: '600.00', minutes: 150 }],
  clients: [{ name: 'آلفا', projectCount: 2, price: '5000.00', paid: '1200.00', due: '3800.00' }],
  expenses: {
    totalIn: '900.00',
    totalOut: '250.00',
    rows: [{
      entryDate: '2026-05-01', description: 'سرور', direction: 'out',
      amountEur: '250.00', accountName: 'بانکِ اصلی',
    }],
  },
  accountsReport: [{
    name: 'بانکِ اصلی', currencyCode: 'EUR',
    opening: '0.00', totalIn: '900.00', totalOut: '250.00', balance: '650.00',
  }],
  hours: [{ title: 'وب‌سایت', minutes: 150 }],
  projectRows: [{
    title: 'وب‌سایت', statusName: 'در حالِ انجام', price: '5000.00',
    clientPaid: '1200.00', clientDue: '3800.00', memberPaid: '400.00',
    profit: '4600.00', minutes: 150,
  }],
  units: [{ name: 'سارا', paid: '100.00', unpaid: '50.00', total: '150.00' }],
  attendance: {
    leaves: [{ name: 'سارا', fromDate: '2026-05-10', toDate: '2026-05-12', note: 'سفر' }],
  },
};

describe('خروجیِ CSV گزارش‌ها', () => {
  it('هر تبِ صادرشدنی نامِ فایل دارد', () => {
    for (const tab of EXPORTABLE_TABS) {
      expect(EXPORT_FILENAMES[tab], tab).toMatch(/\.csv$/);
    }
  });

  it('تبِ ناشناخته صادر نمی‌شود', () => {
    expect(isExportableTab('overall')).toBe(false);
    expect(isExportableTab('closings')).toBe(false);
    expect(isExportableTab('members')).toBe(true);
  });

  it('هر تب سربرگ و دستِ‌کم یک ردیف می‌دهد', () => {
    for (const tab of EXPORTABLE_TABS) {
      const lines = buildReportCsv(tab, data).trim().split('\n');
      expect(lines.length, tab).toBeGreaterThanOrEqual(2);
    }
  });

  it('⚠️ BOM دارد تا اکسل فارسی را درست بخواند', () => {
    expect(buildReportCsv('members', data).startsWith('﻿')).toBe(true);
  });

  it('ستون‌های «اعضا» تثبیت شده‌اند', () => {
    const [header, first] = buildReportCsv('members', data).trim().split('\n');
    expect(header).toContain('عضو');
    expect(header).toContain('بدهی (یورو)');
    // ⚠️ مبلغ **رشته** می‌ماند: تبدیل به عدد گِردکردنِ شناور می‌آورد.
    expect(first).toContain('600.00');
  });

  it('خروجیِ هزینه‌ها سطرِ جمع دارد', () => {
    const text = buildReportCsv('expenses', data);
    expect(text).toContain('مجموعِ ورودی');
    expect(text).toContain('900.00');
  });

  it('خروجیِ دورهٔ بسته ده ستون دارد', () => {
    const csv = buildClosingCsv([{
      accountName: 'بانک', currencyCode: 'EUR', periodStart: '2026-01-01',
      deposits: '10.00', withdrawals: '2.00', closingBalance: '8.00',
      clientReceivedEur: '10.00', memberPaidEur: '1.00', expensesEur: '1.00',
      closingBalanceEur: '8.00',
    }]);
    expect(csv.trim().split('\n')[0]!.split(',')).toHaveLength(10);
  });
});
