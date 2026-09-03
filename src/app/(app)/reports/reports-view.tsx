'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format } from '@/domain/money/money';
import { hoursLabel } from '@/domain/reports/summary';
import { REPORT_TABS } from '@/domain/access/staff-levels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';
import { Download } from 'lucide-react';
import { isExportableTab } from '@/domain/reports/export';
import { monthlyAverage, reportQuery, withBars, type RangePreset } from '@/domain/reports/filters';
import { OfficeFilter, RangeBar, type OfficeOption } from './report-filters';
import {
  TablePager, TableSearch, useTableView, type TableView,
} from '@/components/ui/table-search';
import { chipStyle } from '@/domain/ui/contrast';

/** «دورهٔ بسته» هم خروجی دارد ولی تبِ صادرشدنی نیست — تاریخ لازم دارد. */
function isExportable(tab: string): boolean {
  return isExportableTab(tab) || tab === 'closings';
}

/** فیلترهای صفحه — از نشانی (پورتِ `office_ids_req` و بازه‌های افزونه). */
export interface ReportFilterState {
  officeIds: number[];
  offices: OfficeOption[];
  expenses: { range: { from: string; to: string }; presets: RangePreset[] };
  hours: { range: { from: string; to: string }; allTime: boolean; presets: RangePreset[] };
}

/** تب‌هایی که فیلترِ دفتر دارند — پورتِ افزونه (کلی/اعضا/کارفرمایان/پروژه‌ها/ساعت). */
const OFFICE_TABS = ['overall', 'members', 'clients', 'projects', 'hours'];

export interface ReportsData {
  /** دکمهٔ ترمیمِ یورو — مالک یا مدیرِ مالی. */
  canRecompute: boolean;
  /** پیوندِ پروژه در تبِ پروژه‌ها فقط برای مدیرِ پروژه‌ها (پورتِ افزونه). */
  canManageProjects: boolean;
  overall: {
    projectCount: number;
    totalValue: string;
    expenses: string;
    clientPaid: string;
    clientDue: string;
    memberAgreed: string;
    memberPaid: string;
    memberDebt: string;
    minutes: number;
    /** ردیف‌هایی که نرخِ تبدیل نداشتند و صفر شمرده شدند. */
    rateMissing: number;
    /** سودِ ناخالصِ تخمینی = ارزشِ پروژه‌ها − تعهد به اعضا. */
    profit: string;
    /** نوارِ نرخ‌ها — پورتِ `rate_banner_html`. */
    rates: { shown: string[]; stale: string[]; missing: string[]; visible: boolean };
  };
  members: Array<{
    id: number; name: string; agreed: string; paid: string;
    remaining: string; minutes: number;
    projects: number; isFormer: boolean;
    byCurrency: Array<{ currencyId: number; code: string; agreed: string; paid: string; debt: string }>;
  }>;
  clients: Array<{
    id: number; name: string; projectCount: number;
    price: string; expenses: string; paid: string; due: string;
    billed: string; isFormer: boolean;
    byCurrency: Array<{ currencyId: number; code: string; billed: string; paid: string; due: string }>;
  }>;
  expenses: {
    range: { from: string; to: string };
    total: string;
    count: number;
    months: number;
    avg: string;
    byVendor: Array<{ id: number; label: string; count: number; amount: string }>;
    byMonth: Array<{ ym: string; amount: string; pct: number }>;
    totalIn: string;
    totalOut: string;
    rows: Array<{
      id: number; entryDate: string; description: string; direction: string;
      amountEur: string; accountName: string | null; vendorId: number;
    }>;
  };
  accountsReport: Array<{
    id: number; name: string; currencyCode: string | null;
    opening: string; totalIn: string; totalOut: string; balance: string;
    balanceEur: string | null;
  }>;
  hours: Array<{ userId: number; name: string; project: number; general: number; total: number }>;
  projectRows: Array<{
    id: number; title: string; statusName: string | null; statusColor: string | null;
    price: string; clientPaid: string; clientDue: string; memberPaid: string;
    profit: string; minutes: number;
  }>;
  units: Array<{ userId: number; name: string; paid: string; unpaid: string; total: string }>;
  attendance: {
    leaves: Array<{
      userId: number; name: string; fromDate: string; toDate: string; note: string;
    }>;
    withoutSchedule: Array<{ id: number; name: string }>;
  };
  closings: {
    dates: string[];
    active: string | null;
    /** قفلِ فعلیِ دوره — برای نشانِ «کهنه» روی خلاصه‌ای که دوره‌اش دوباره باز شده. */
    lockDate: string | null;
    rows: Array<{
      accountName: string; currencyCode: string | null; periodStart: string;
      deposits: string; withdrawals: string; closingBalance: string;
      clientReceivedEur: string; memberPaidEur: string; expensesEur: string;
      closingBalanceEur: string;
    }>;
  };
}

/** ⚠️ فهرستِ تب‌ها یک‌جا در دامنه است تا UI ِ دسترسی و این صفحه از هم جدا نیفتند. */
const TABS = REPORT_TABS;

/**
 * گزارش‌ها — شش تبِ نخستِ.
 *
 * ⚠️ همهٔ اعداد در ارزِ پایه (یورو) و از ستون‌های **منجمد** می‌آیند؛
 * گزارشِ پارسال با نرخِ امروز عوض نمی‌شود (R-FISCAL-08).
 */
export function ReportsView({
  data,
  tabs,
  initialTab,
  filters,
}: {
  data: ReportsData;
  tabs: string[];
  /** تبِ آمده از نشانی — برای پیوندِ مستقیم به «دوره‌های بسته‌شده». */
  initialTab?: string | null;
  filters: ReportFilterState;
}) {
  const tr = useT();
  /**
   * فیلترِ زندهٔ طرف‌حساب (پورتِ `kteam-expven-filter`): انتخابِ چند طرف‌حساب،
   * کارت‌ها و جدول‌های تبِ هزینه‌ها همان‌جا دوباره جمع می‌شوند؛ null = همه.
   */
  const [vendorSel, setVendorSel] = useState<number[] | null>(null);
  const expenseStats = useMemo(() => {
    if (vendorSel === null) return data.expenses;
    const on = new Set(vendorSel);
    const rows = data.expenses.rows.filter((r) => r.direction === 'out' && on.has(r.vendorId));
    const total = rows.reduce((sum, r) => sum + Number(r.amountEur), 0);
    const months = new Map<string, number>();
    for (const r of rows) months.set(r.entryDate.slice(0, 7), (months.get(r.entryDate.slice(0, 7)) ?? 0) + Number(r.amountEur));
    const byMonth = withBars([...months].map(([ym, amount]) => ({ ym, amount })).sort((a, b) => b.ym.localeCompare(a.ym)));
    return {
      ...data.expenses,
      total: total.toFixed(2),
      count: rows.length,
      months: byMonth.length,
      avg: monthlyAverage(total, byMonth.length).toFixed(2),
      byVendor: data.expenses.byVendor.filter((v) => on.has(v.id)),
      byMonth: byMonth.map((m) => ({ ym: m.ym, amount: m.amount.toFixed(2), pct: m.pct })),
      rows: data.expenses.rows.filter((r) => r.direction !== 'out' || on.has(r.vendorId)),
    };
  }, [data.expenses, vendorSel]);
  const toggleVendor = (id: number) => setVendorSel((prev) => {
    const base = prev ?? [];
    return base.includes(id) ? (base.length === 1 ? null : base.filter((x) => x !== id)) : [...base, id];
  });
  /** پارامترهای بازهٔ ساعت که فیلترِ دفتر باید حفظ کند. */
  const hoursExtra = filters.hours.allTime
    ? { hfrom: '', hto: '' }
    : { hfrom: filters.hours.range.from, hto: filters.hours.range.to };
  const exportQuery = reportQuery({
    office: filters.officeIds,
    from: filters.expenses.range.from, to: filters.expenses.range.to,
    hfrom: filters.hours.range.from, hto: filters.hours.range.to, hoursAllTime: filters.hours.allTime,
  });
  // مالک می‌تواند تبی را از یک همکار پنهان کند؛ پس فهرست فیلتر می‌شود و
  // تبِ فعالِ اولیه هم باید از همان فهرستِ مجاز بیاید، نه ثابت 'overall'.
  const visible = TABS.filter((t) => tabs.includes(t.key));
  /**
   * ⚠️ تبِ نشانی فقط وقتی پذیرفته می‌شود که در فهرستِ **مجازِ** این کاربر
   * باشد — وگرنه تایپِ دستیِ `?tab=` تبی را باز می‌کرد که برایش پنهان شده.
   */
  const requested = initialTab && visible.some((t) => t.key === initialTab) ? initialTab : null;
  const [tab, setTab] = useState<string>(requested ?? visible[0]?.key ?? 'overall');

  /**
   * جستجوی زندهٔ هر جدول — پورتِ `data-kt-search` نسخهٔ قبلی.
   *
   * ⚠️ هر تب تابعِ جستجوی خودش را دارد چون ستون‌های معنادارش فرق می‌کند:
   * در «اعضا» نام کافی است، در «پروژه‌ها» عنوان و وضعیت، در «هزینه‌ها» شرح و
   * حساب. یک تابعِ عمومی روی همهٔ ستون‌ها، عددها را هم می‌گرداند و نتیجهٔ
   * بی‌ربط می‌داد ("۸۰۰" در مبلغ با "۸۰۰" در شناسه یکی می‌شد).
   */
  const membersView = useTableView(data.members, (m) => m.name);
  const clientsView = useTableView(data.clients, (c) => c.name);
  const expensesView = useTableView(
    expenseStats.rows, (r) => `${r.description} ${r.accountName ?? ''} ${r.entryDate}`,
  );
  const accountsView = useTableView(
    data.accountsReport, (a) => `${a.name} ${a.currencyCode ?? ''}`,
  );
  const hoursView = useTableView(data.hours, (h) => h.name);
  const projectsView = useTableView(
    data.projectRows, (p) => `${p.title} ${p.statusName ?? ''}`,
  );
  const unitsView = useTableView(data.units, (u) => u.name);
  const attendanceView = useTableView(
    data.attendance.leaves, (l) => `${l.name} ${l.note}`,
  );


  /**
   * نمای تبِ فعال — جدولی که جعبهٔ جستجو باید بگرداند.
   *
   * ⚠️ «گزارش کلی» و «دوره‌های بسته» عمداً نما ندارند: اولی کارت است نه
   * جدول، و دومی خودش انتخابگرِ تاریخ دارد.
   */
  const searchable: Record<string, { view: TableView<unknown>; hint: string }> = {
    members: { view: membersView, hint: 'جستجوی نام عضو…' },
    clients: { view: clientsView, hint: 'جستجوی نام کارفرما…' },
    expenses: { view: expensesView, hint: 'جستجوی شرح یا حساب…' },
    accounts: { view: accountsView, hint: 'جستجوی نام حساب…' },
    hours: { view: hoursView, hint: 'جستجوی نام عضو…' },
    projects: { view: projectsView, hint: 'جستجوی نام پروژه…' },
    units: { view: unitsView, hint: 'جستجوی نام عضو…' },
    attendance: { view: attendanceView, hint: 'جستجوی نام عضو…' },
  };
  const activeView = searchable[tab]?.view ?? null;
  const searchHint = tr(searchable[tab]?.hint ?? 'جستجوی زنده');

  if (visible.length === 0) {
    return <EmptyState title={tr("تبی برای شما فعال نیست")} description={tr("از مدیر بخواهید دسترسیِ تب‌های گزارش را بدهد.")} />;
  }

  /** پورتِ سه گروهِ کارتِ `overall()`: کارفرمایان / اعضا / کلی (با سودِ تخمینی). */
  const negativeProfit = Number(data.overall.profit) < 0;
  const cardGroups: Array<{ title: string; cards: Array<{ label: string; value: string; strong?: boolean; danger?: boolean }> }> = [
    { title: 'کارفرمایان', cards: [
      { label: 'ارزش پروژه‌ها', value: format(data.overall.totalValue) },
      { label: 'هزینه‌های قابلِ صورت‌حساب', value: format(data.overall.expenses) },
      { label: 'دریافتی از کارفرما', value: format(data.overall.clientPaid) },
      { label: 'مطالبات از کارفرما', value: format(data.overall.clientDue), strong: true },
    ] },
    { title: 'اعضا', cards: [
      { label: 'توافقیِ اعضا', value: format(data.overall.memberAgreed) },
      { label: 'پرداختی به اعضا', value: format(data.overall.memberPaid) },
      { label: 'بدهی به اعضا', value: format(data.overall.memberDebt), strong: true },
    ] },
    { title: 'کلی', cards: [
      { label: 'تعداد پروژه', value: String(data.overall.projectCount) },
      { label: 'ساعت کاری', value: hoursLabel(data.overall.minutes) },
      { label: 'سود تخمینی', value: format(data.overall.profit), strong: true, danger: negativeProfit },
    ] },
  ];
  const sum = (rows: Array<Record<string, unknown>>, key: string) =>
    rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0).toFixed(2);
  /** پورتِ خطِ «بدهی/طلب به تفکیکِ ارز»: جمعِ خط‌های ارزیِ همهٔ ردیف‌ها. */
  const byCurrencyTotals = (rows: Array<{ byCurrency: Array<{ code: string; [k: string]: unknown }> }>, key: string) => {
    const totals = new Map<string, number>();
    for (const r of rows) for (const l of r.byCurrency) totals.set(l.code, (totals.get(l.code) ?? 0) + Number(l[key] ?? 0));
    return [...totals.entries()].map(([code, v]) => `${format(v.toFixed(2))} ${code}`).join(' · ');
  };

  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-1 border-b">
        {visible.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tr(t.label)}
          </button>
        ))}
      </nav>

      {/*
        ⚠️ پیوندِ ساده، نه دکمهٔ جاوااسکریپتی: مرورگر خودش دانلود را می‌گیرد و
        هدرِ `Content-Disposition` نامِ فارسیِ فایل را می‌سازد. تبِ «گزارش کلی»
        خروجی ندارد چون خودش خلاصه است، نه جدول.
      */}
      {/*
        نوارِ ابزارِ جدول — جستجو در یک سمت، خروجی در سمتِ دیگر.

        ⚠️ **یک** جعبهٔ جستجو برای همهٔ تب‌ها، نه یکی در هر جدول: جای ثابت
        یعنی کاربر هر بار دنبالش نمی‌گردد، و کد هم یک نقطهٔ نگهداری دارد نه
        هشت‌تا. کدام نما را بگرداند از تبِ فعال می‌آید.
      */}
      {(activeView || isExportable(tab)) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {activeView
            ? <TableSearch view={activeView} placeholder={searchHint} />
            : <span />}

          {isExportable(tab) && (
            <a
              href={`/reports/export?tab=${tab}&${exportQuery}${tab === 'closings' && data.closings.active ? `&date=${data.closings.active}` : ''}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download className="size-3.5" />
              {tr("خروجی CSV")}
            </a>
          )}
        </div>
      )}

      {/* پورتِ `office_filter_html`: فیلترِ چنددفتری روی تب‌های کلی/اعضا/کارفرمایان/پروژه‌ها/ساعت. */}
      {OFFICE_TABS.includes(tab) && filters.offices.length > 0 && (
        <OfficeFilter
          tab={tab}
          offices={filters.offices}
          selected={filters.officeIds}
          extra={tab === 'hours' ? hoursExtra : {}}
        />
      )}

      {tab === 'overall' && (
        <div className="grid gap-3">
        {data.canRecompute && <RecomputeEurButton />}
        {/* ⚠️ نبودِ نرخ بی‌صدا ۱ نمی‌شود (R-MONEY-06) — ولی بی‌صدا هم نمی‌ماند. */}
        {/* پورتِ `rate_banner_html`: نرخ‌هایی که ارقام بر آن‌ها تکیه دارند + هشدارِ کهنه/غایب. */}
        {data.overall.rates.visible && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-xs">
            {data.overall.rates.shown.length > 0 && (
              <span className="num" dir="ltr">{data.overall.rates.shown.join('  ·  ')}</span>
            )}
            {data.overall.rates.stale.length > 0 && (
              <span className="text-amber-600 dark:text-amber-500">
                ⚠ {tr('نرخِ {codes} مدتی است به‌روزرسانی نشده؛ ارقام شاید قدیمی باشند.', { codes: data.overall.rates.stale.join(tr('، ')) })}
              </span>
            )}
            {data.overall.rates.missing.length > 0 && (
              <span className="text-destructive">
                ⚠ {tr('برای {codes} نرخی ثبت نشده؛ ردیف‌های آن ارز صفر شمرده می‌شوند. در تنظیمات ← ارزها ثبت کنید.', { codes: data.overall.rates.missing.join(tr('، ')) })}
              </span>
            )}
          </div>
        )}
        {data.overall.rateMissing > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {tr('{n} ردیف نرخِ تبدیل به ارزِ پایه ندارد و در این ارقام صفر شمرده شده. نرخ را در تنظیمات اضافه کنید.', { n: data.overall.rateMissing })}
          </p>
        )}
        {cardGroups.map((group) => (
          <section key={group.title} className="grid gap-2">
            <h3 className="text-sm font-semibold">{tr(group.title)}</h3>
            <div className="grid gap-3 @3xl/main:grid-cols-4 @xl/main:grid-cols-2">
              {group.cards.map((c) => (
                <Card key={c.label} className={c.danger ? 'border-destructive/50' : ''}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-normal text-muted-foreground">{tr(c.label)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`num ${c.strong ? 'text-xl font-semibold' : 'text-lg font-medium'} ${c.danger ? 'text-destructive' : ''}`}>
                      {c.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
        <p className="text-xs text-muted-foreground">
          {tr("سودِ تخمینی = ارزشِ پروژه‌ها − تعهد به اعضا؛ پروژه‌محور است و هزینه‌های عمومی (دوره‌ای/بی‌پروژه) در آن نیست.")}
        </p>
        </div>
      )}

      {tab === 'members' && (
        data.members.length === 0 ? <EmptyState title={tr("داده‌ای نیست")} /> : (
          <div className="grid gap-3">
          {/* پورتِ کارت‌های جمعِ تبِ اعضا: تعهد / پرداختی / بدهی (یورو). */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'تعهد به اعضا', value: sum(data.members, 'agreed') },
              { label: 'پرداختی به اعضا', value: sum(data.members, 'paid') },
              { label: 'بدهی به اعضا', value: sum(data.members, 'remaining') },
            ].map((c) => (
              <Card key={c.label}>
                <CardHeader className="pb-2"><CardTitle className="text-xs font-normal text-muted-foreground">{tr(c.label)}</CardTitle></CardHeader>
                <CardContent><p className="num text-lg font-medium">{format(c.value)}</p></CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {tr("بدهی به تفکیک ارز:")} <span className="num">{byCurrencyTotals(data.members, 'debt') || '—'}</span>
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("عضو")}</TableHead>
                <TableHead>{tr("پروژه‌ها")}</TableHead>
                <TableHead>{tr("توافقی")}</TableHead>
                <TableHead>{tr("پرداختی")}</TableHead>
                <TableHead>{tr("مانده")}</TableHead>
                <TableHead>{tr("ساعت کاری")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersView.rows.map((m) => (
                <TableRow key={m.id}>
                  {/* ریز شدن روی یک عضو — پروژه‌به‌پروژه با ردیف‌های پرداخت. */}
                  <TableCell>
                    <Link href={`/reports/member/${m.id}`} className="hover:underline">
                      {m.name}
                    </Link>
                    {m.isFormer && <Badge variant="outline" className="ms-1.5 text-[10px]">{tr("سابق")}</Badge>}
                  </TableCell>
                  <TableNumericCell>{m.projects}</TableNumericCell>
                  <TableNumericCell>{format(m.agreed)}</TableNumericCell>
                  <TableNumericCell>{format(m.paid)}</TableNumericCell>
                  <TableNumericCell className={Number(m.remaining) > 0 ? 'text-amber-600 dark:text-amber-500' : ''}>
                    {format(m.remaining)}
                    {/* پورتِ چیپ‌های بدهی به‌ازای هر ارز — بدهیِ چندارزی پشتِ یک عدد پنهان نمی‌ماند. */}
                    {m.byCurrency.length > 1 && (
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {m.byCurrency.map((l) => `${format(l.debt)} ${l.code}`).join(' · ')}
                      </span>
                    )}
                  </TableNumericCell>
                  {/*
                    ⚠️ خودِ عدد پیوند است، نه یک ستونِ اضافه: ریزِ ساعت
                    ادامهٔ همین عدد است و ستونِ تازه جدول را شلوغ می‌کرد.
                  */}
                  <TableNumericCell>
                    <Link href={`/reports/hours/${m.id}`} className="hover:underline">
                      {hoursLabel(m.minutes)}
                    </Link>
                  </TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )
      )}

      {tab === 'clients' && (
        data.clients.length === 0 ? <EmptyState title={tr("کارفرمایی به پروژه‌ای وصل نیست")} /> : (
          <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'صورتحساب‌شدهٔ کل', value: sum(data.clients, 'billed') },
              { label: 'دریافتیِ کل', value: sum(data.clients, 'paid') },
              { label: 'طلبِ کل', value: sum(data.clients, 'due') },
            ].map((c) => (
              <Card key={c.label}>
                <CardHeader className="pb-2"><CardTitle className="text-xs font-normal text-muted-foreground">{tr(c.label)}</CardTitle></CardHeader>
                <CardContent><p className="num text-lg font-medium">{format(c.value)}</p></CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {tr("طلب به تفکیک ارز:")} <span className="num">{byCurrencyTotals(data.clients, 'due') || '—'}</span>
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("کارفرما")}</TableHead>
                <TableHead>{tr("قیمت")}</TableHead>
                <TableHead>{tr("هزینه‌های قابلِ صورت‌حساب")}</TableHead>
                <TableHead>{tr("دریافتی")}</TableHead>
                <TableHead>{tr("مطالبات")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientsView.rows.map((c) => (
                <TableRow key={c.id}>
                  {/* ریز شدن روی یک کارفرما — مطالبات پروژه‌به‌پروژه. */}
                  <TableCell>
                    <Link href={`/reports/client/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                    <span className="num ms-1 text-xs text-muted-foreground">
                      ({c.projectCount})
                    </span>
                    {c.isFormer && <Badge variant="outline" className="ms-1.5 text-[10px]">{tr("سابق")}</Badge>}
                  </TableCell>
                  <TableNumericCell>{format(c.price)}</TableNumericCell>
                  <TableNumericCell>{format(c.expenses)}</TableNumericCell>
                  <TableNumericCell>{format(c.paid)}</TableNumericCell>
                  <TableNumericCell className={Number(c.due) > 0 ? 'text-amber-600 dark:text-amber-500' : ''}>
                    {format(c.due)}
                    {c.byCurrency.length > 1 && (
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {c.byCurrency.map((l) => `${format(l.due)} ${l.code}`).join(' · ')}
                      </span>
                    )}
                  </TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )
      )}

      {tab === 'expenses' && (
        <div className="grid gap-3">
          <RangeBar tab="expenses" presets={filters.expenses.presets} range={filters.expenses.range} officeIds={filters.officeIds} />

          {/* پورتِ کارت‌های افزونه: جمع (قرمز اگر مثبت)، تعداد، میانگینِ ماهانه از ماه‌های دارای داده. */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'مجموع هزینه‌ها (یورو)', value: format(expenseStats.total), danger: Number(expenseStats.total) > 0 },
              { label: 'تعداد ردیف', value: String(expenseStats.count), danger: false },
              { label: 'میانگین ماهانه (یورو)', value: format(expenseStats.avg), danger: false },
            ].map((c) => (
              <Card key={c.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-normal text-muted-foreground">{tr(c.label)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`num text-lg font-semibold ${c.danger ? 'text-destructive' : ''}`}>{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {tr("مجموعِ خروجی‌های واقعی (برداشت‌های دفترکل، بدونِ انتقال‌های داخلی و پرداخت به اعضا)، نرمال‌شده به یورو.")}
          </p>

          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">{tr("به تفکیک طرف‌حساب")}</h3>
            {data.expenses.byVendor.length >= 2 && (
              <div className="flex flex-wrap items-center gap-1">
                {data.expenses.byVendor.map((v) => {
                  const on = vendorSel === null || vendorSel.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => toggleVendor(v.id)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        vendorSel !== null && on ? 'border-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {v.label || tr('بدون طرف‌حساب')}
                    </button>
                  );
                })}
                {vendorSel !== null && (
                  <button type="button" onClick={() => setVendorSel(null)} className="text-xs text-muted-foreground underline">
                    {tr('همه')}
                  </button>
                )}
              </div>
            )}
            {expenseStats.byVendor.length === 0 ? <p className="text-sm text-muted-foreground">{tr("موردی پیدا نشد.")}</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("طرف‌حساب")}</TableHead>
                    <TableHead>{tr("تعداد")}</TableHead>
                    <TableHead>{tr("مبلغ (یورو)")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseStats.byVendor.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>{v.label || <span className="text-muted-foreground">{tr('بدون طرف‌حساب')}</span>}</TableCell>
                      <TableNumericCell>{v.count}</TableNumericCell>
                      <TableNumericCell>{format(v.amount)}</TableNumericCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">{tr("به تفکیک ماه")}</h3>
            {expenseStats.byMonth.length === 0 ? <p className="text-sm text-muted-foreground">{tr("موردی پیدا نشد.")}</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("ماه")}</TableHead>
                    <TableHead className="w-1/2">{tr("روند")}</TableHead>
                    <TableHead>{tr("مبلغ (یورو)")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseStats.byMonth.map((m) => (
                    <TableRow key={m.ym}>
                      <TableNumericCell>{m.ym}</TableNumericCell>
                      <TableCell>
                        {/* پورتِ نوارِ روند: درصدِ هر ماه نسبت به پرترین ماه. */}
                        <span className="block h-2 w-full rounded bg-muted">
                          <span className="block h-2 rounded bg-primary" style={{ width: `${m.pct}%` }} />
                        </span>
                      </TableCell>
                      <TableNumericCell>{format(m.amount)}</TableNumericCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">{tr("ردیف‌های دفتر")}</h3>
            {expenseStats.rows.length === 0 ? <EmptyState title={tr("ردیفی نیست")} /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("تاریخ")}</TableHead>
                    <TableHead>{tr("شرح")}</TableHead>
                    <TableHead>{tr("حساب")}</TableHead>
                    <TableHead>{tr("جهت")}</TableHead>
                    <TableHead>{tr("معادل یورو")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expensesView.rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableNumericCell>{r.entryDate}</TableNumericCell>
                      <TableCell>{r.description || '—'}</TableCell>
                      <TableCell>{r.accountName ?? '—'}</TableCell>
                      <TableCell>{tr(r.direction === 'in' ? 'درآمد' : 'هزینه')}</TableCell>
                      <TableNumericCell>{format(r.amountEur)}</TableNumericCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      )}

      {tab === 'accounts' && (
        data.accountsReport.length === 0 ? <EmptyState title={tr("حسابی نیست")} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("حساب")}</TableHead>
                <TableHead>{tr("ارز")}</TableHead>
                <TableHead>{tr("مانده اولیه")}</TableHead>
                <TableHead>{tr("واریز")}</TableHead>
                <TableHead>{tr("برداشت")}</TableHead>
                <TableHead>{tr("مانده")}</TableHead>
                <TableHead>{tr("معادل یورو")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountsView.rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell className="num">{a.currencyCode ?? '—'}</TableCell>
                  <TableNumericCell>{format(a.opening)}</TableNumericCell>
                  <TableNumericCell>{format(a.totalIn)}</TableNumericCell>
                  <TableNumericCell>{format(a.totalOut)}</TableNumericCell>
                  <TableNumericCell className="font-semibold">{format(a.balance)}</TableNumericCell>
                  <TableNumericCell className="text-muted-foreground">{a.balanceEur === null ? '—' : format(a.balanceEur)}</TableNumericCell>
                </TableRow>
              ))}
              {/* پورتِ پاورقیِ «نقدینگیِ کل» — جمعِ همهٔ حساب‌ها در یورو. */}
              <TableRow>
                <TableCell colSpan={6} className="font-semibold">{tr("نقدینگیِ کل (یورو)")}</TableCell>
                <TableNumericCell className="font-semibold">
                  {format(data.accountsReport.reduce((acc, a) => acc + Number(a.balanceEur ?? 0), 0).toFixed(2))}
                </TableNumericCell>
              </TableRow>
            </TableBody>
          </Table>
        )
      )}

      {tab === 'hours' && (
        <div className="grid gap-3">
          <RangeBar tab="hours" presets={filters.hours.presets} range={filters.hours.range} officeIds={filters.officeIds} hours />
          {data.hours.length === 0 ? <EmptyState title={tr("در این بازه ساعتی ثبت نشده")} /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr("عضو")}</TableHead>
                  <TableHead>{tr("ساعتِ پروژه")}</TableHead>
                  <TableHead>{tr("ساعتِ عمومی")}</TableHead>
                  <TableHead>{tr("مجموع")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {hoursView.rows.map((h) => (
                  <TableRow key={h.userId}>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableNumericCell>{hoursLabel(h.project)}</TableNumericCell>
                    <TableNumericCell>{hoursLabel(h.general)}</TableNumericCell>
                    <TableNumericCell className="font-semibold">{hoursLabel(h.total)}</TableNumericCell>
                    <TableCell>
                      {/* ریزِ عضو با همان بازه — پورتِ `detail_url`. */}
                      <Link
                        href={`/reports/hours/${h.userId}?${filters.hours.allTime ? 'from=&to=' : reportQuery({ from: filters.hours.range.from, to: filters.hours.range.to })}`}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        {tr("جزئیات")}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {tab === 'projects' && (
        data.projectRows.length === 0 ? <EmptyState title={tr("پروژه‌ای نیست")} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("پروژه")}</TableHead>
                <TableHead>{tr("وضعیت")}</TableHead>
                <TableHead>{tr("قیمت")}</TableHead>
                <TableHead>{tr("دریافتی")}</TableHead>
                <TableHead>{tr("مطالبات")}</TableHead>
                <TableHead>{tr("پرداختی به اعضا")}</TableHead>
                <TableHead>{tr("سود")}</TableHead>
                <TableHead>{tr("ساعت کاری")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectsView.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {/* پورتِ افزونه: عنوان فقط برای مدیرِ پروژه‌ها پیوند است و به تبِ مالی می‌رود. */}
                    {data.canManageProjects
                      ? <Link href={`/projects/${p.id}?tab=finance`} className="hover:underline">{p.title}</Link>
                      : p.title}
                  </TableCell>
                  <TableCell>
                    {p.statusName ? (
                      <Badge
                        variant="outline"
                        style={chipStyle(p.statusColor)}
                      >
                        {p.statusName}
                      </Badge>
                    ) : '—'}
                  </TableCell>
                  <TableNumericCell>{format(p.price)}</TableNumericCell>
                  <TableNumericCell>{format(p.clientPaid)}</TableNumericCell>
                  <TableNumericCell>{format(p.clientDue)}</TableNumericCell>
                  <TableNumericCell>{format(p.memberPaid)}</TableNumericCell>
                  {/* ⚠️ سودِ منفی باید در نگاهِ اول دیده شود، نه با خواندنِ رقم. */}
                  <TableNumericCell
                    className={Number(p.profit) < 0 ? 'font-semibold text-destructive' : 'font-semibold'}
                  >
                    {format(p.profit)}
                  </TableNumericCell>
                  <TableNumericCell>{hoursLabel(p.minutes)}</TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      {tab === 'units' && (
        data.units.length === 0 ? (
          <EmptyState
            title={tr("کارکردِ تعدادی ثبت نشده")}
            description={tr("فقط پروژه‌های «تعدادی» ردیفِ کارکرد می‌سازند.")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("عضو")}</TableHead>
                <TableHead>{tr("پرداخت‌شده")}</TableHead>
                <TableHead>{tr("پرداخت‌نشده")}</TableHead>
                <TableHead>{tr("جمع")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unitsView.rows.map((u) => (
                <TableRow key={u.userId}>
                  <TableCell>{u.name}</TableCell>
                  <TableNumericCell>{format(u.paid)}</TableNumericCell>
                  <TableNumericCell
                    className={Number(u.unpaid) > 0 ? 'text-amber-600 dark:text-amber-500' : ''}
                  >
                    {format(u.unpaid)}
                  </TableNumericCell>
                  <TableNumericCell className="font-semibold">{format(u.total)}</TableNumericCell>
                </TableRow>
              ))}
              {/* پورتِ پاورقیِ افزونه: جمعِ پرداخت‌شده / پرداخت‌نشده / کل. */}
              <TableRow>
                <TableCell className="font-semibold">{tr("جمع")}</TableCell>
                <TableNumericCell className="font-semibold">{format(sum(data.units, 'paid'))}</TableNumericCell>
                <TableNumericCell className="font-semibold">{format(sum(data.units, 'unpaid'))}</TableNumericCell>
                <TableNumericCell className="font-semibold">{format(sum(data.units, 'total'))}</TableNumericCell>
              </TableRow>
            </TableBody>
          </Table>
        )
      )}

      {tab === 'attendance' && (
        <div className="grid gap-5">
          {/*
            ⚠️ «بدونِ برنامه» اول می‌آید، نه مرخصی‌ها: مرخصی را همه ثبت
            می‌کنند، ولی نداشتنِ برنامه بی‌سروصدا می‌ماند و همان است که
            «کِی در دسترس است؟» را بی‌جواب می‌گذارد.
          */}
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">{tr("اعضای بدونِ برنامهٔ هفتگی")}</h3>
            {data.attendance.withoutSchedule.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("همهٔ اعضا برنامهٔ هفتگی داده‌اند.")}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {data.attendance.withoutSchedule.map((m) => (
                  <li key={m.id}>
                    <Badge variant="outline">{m.name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">{tr("مرخصی‌های ثبت‌شده")}</h3>
            {data.attendance.leaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("مرخصی‌ای ثبت نشده.")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("عضو")}</TableHead>
                    <TableHead>{tr("از")}</TableHead>
                    <TableHead>{tr("تا")}</TableHead>
                    <TableHead>{tr("توضیح")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceView.rows.map((l, i) => (
                    <TableRow key={`${l.userId}-${l.fromDate}-${i}`}>
                      <TableCell>{l.name}</TableCell>
                      <TableNumericCell>{l.fromDate}</TableNumericCell>
                      <TableNumericCell>{l.toDate}</TableNumericCell>
                      <TableCell>{l.note || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      )}

      {/*
        ⚠️ صفحه‌بند **زیرِ** جدول می‌آید، نه بالا: کاربر تا ته جدول می‌خواند و
        دکمهٔ «بعدی» باید همان‌جا دستش باشد، نه بالای صفحه.
      */}
      {activeView && <TablePager view={activeView} />}

      {tab === 'closings' && (
        data.closings.dates.length === 0 ? (
          <EmptyState
            title={tr("هیچ دوره‌ای بسته نشده")}
            description={tr("از تنظیمات ← دورهٔ مالی می‌توانید یک دوره را ببندید.")}
          />
        ) : (
          <div className="grid gap-3">
            {/*
              ⚠️ ردیف‌های هر دوره روی **سرور** خوانده می‌شوند، نه همه با هم:
              با ده‌ها دوره و ده‌ها حساب، فرستادنِ همه به مرورگر بی‌جهت است.
            */}
            {/* پورتِ اعلانِ قفل: «دوره تا تاریخ … قفل است». */}
            <p className="text-xs text-muted-foreground">
              {data.closings.lockDate
                ? tr('دوره تا تاریخ {date} قفل است.', { date: data.closings.lockDate })
                : tr('در حالِ حاضر هیچ دوره‌ای قفل نیست؛ خلاصه‌های زیر ممکن است با دفترِ فعلی نخوانند.')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{tr("تاریخِ بستن:")}</span>
              {data.closings.dates.map((d) => {
                // پورتِ نشانِ «کهنه»: قفل خالی یا کوتاه‌تر از تاریخِ بستن — دوره دوباره باز شده.
                const stale = !data.closings.lockDate || data.closings.lockDate < d;
                return (
                  <Link
                    key={d}
                    href={`/reports?tab=closings&date=${d}`}
                    className={`num rounded-md border px-3 py-1 text-xs ${
                      d === data.closings.active ? 'border-primary font-medium' : 'hover:bg-muted'
                    }`}
                  >
                    {d}
                    {stale && <span className="ms-1 text-amber-600 dark:text-amber-500">({tr('کهنه')})</span>}
                  </Link>
                );
              })}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr("حساب")}</TableHead>
                  <TableHead>{tr("از")}</TableHead>
                  <TableHead>{tr("واریز")}</TableHead>
                  <TableHead>{tr("برداشت")}</TableHead>
                  <TableHead>{tr("مانده")}</TableHead>
                  <TableHead>{tr("از کارفرما")}</TableHead>
                  <TableHead>{tr("به اعضا")}</TableHead>
                  <TableHead>{tr("هزینه‌ها")}</TableHead>
                  <TableHead>{tr("مانده پایان (یورو)")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.closings.rows.map((r, i) => (
                  <TableRow key={`${r.accountName}-${i}`}>
                    <TableCell>
                      {r.accountName}
                      {r.currencyCode && (
                        <span className="num ms-1 text-xs text-muted-foreground">
                          {r.currencyCode}
                        </span>
                      )}
                    </TableCell>
                    <TableNumericCell>{r.periodStart}</TableNumericCell>
                    <TableNumericCell>{format(r.deposits)}</TableNumericCell>
                    <TableNumericCell>{format(r.withdrawals)}</TableNumericCell>
                    <TableNumericCell className="font-semibold">
                      {format(r.closingBalance)}
                    </TableNumericCell>
                    <TableNumericCell>{format(r.clientReceivedEur)}</TableNumericCell>
                    <TableNumericCell>{format(r.memberPaidEur)}</TableNumericCell>
                    <TableNumericCell>{format(r.expensesEur)}</TableNumericCell>
                    <TableNumericCell>{format(r.closingBalanceEur)}</TableNumericCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
  );
}

/**
 * ترمیمِ معادلِ یورو — پورتِ دکمهٔ نسخهٔ قبلی در تبِ گزارشِ کلی.
 * ⚠️ ردیفی که پیش از واردشدنِ نرخش ثبت شده با یوروی صفر منجمد مانده و
 * جمع‌ها را کج می‌کند؛ این دکمه با نرخ‌های فعلی درستش می‌کند (فقط مالک).
 */
function RecomputeEurButton() {
  const tr = useT();
  const [state, setState] = useState<{ error?: string; message?: string }>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const { recomputeEurAction } = await import('./_actions');
          setState(await recomputeEurAction());
        })}
      >
        {pending ? tr('در حالِ بازمحاسبه…') : tr('بازمحاسبهٔ معادلِ یورو')}
      </Button>
      <span className="text-xs text-muted-foreground">
        {state.error ?? state.message
          ?? tr('برای ردیف‌هایی که پیش از ثبتِ نرخِ ارزشان وارد شده‌اند.')}
      </span>
    </div>
  );
}

