'use client';

import { useState, useTransition } from 'react';
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
import {
  TablePager, TableSearch, useTableView, type TableView,
} from '@/components/ui/table-search';

/** «دورهٔ بسته» هم خروجی دارد ولی تبِ صادرشدنی نیست — تاریخ لازم دارد. */
function isExportable(tab: string): boolean {
  return isExportableTab(tab) || tab === 'closings';
}

export interface ReportsData {
  /** دکمهٔ ترمیمِ یورو فقط برای مالک. */
  isOwner: boolean;
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
  };
  members: Array<{
    id: number; name: string; agreed: string; paid: string;
    remaining: string; minutes: number;
  }>;
  clients: Array<{
    id: number; name: string; projectCount: number;
    price: string; expenses: string; paid: string; due: string;
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
    id: number; name: string; currencyCode: string | null;
    opening: string; totalIn: string; totalOut: string; balance: string;
  }>;
  hours: Array<{ projectId: number; title: string; minutes: number }>;
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
}: {
  data: ReportsData;
  tabs: string[];
  /** تبِ آمده از نشانی — برای پیوندِ مستقیم به «دوره‌های بسته‌شده». */
  initialTab?: string | null;
}) {
  const tr = useT();
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
    data.expenses.rows, (r) => `${r.description} ${r.accountName ?? ''} ${r.entryDate}`,
  );
  const accountsView = useTableView(
    data.accountsReport, (a) => `${a.name} ${a.currencyCode ?? ''}`,
  );
  const hoursView = useTableView(data.hours, (h) => h.title);
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
    hours: { view: hoursView, hint: 'جستجوی نام پروژه…' },
    projects: { view: projectsView, hint: 'جستجوی نام پروژه…' },
    units: { view: unitsView, hint: 'جستجوی نام عضو…' },
    attendance: { view: attendanceView, hint: 'جستجوی نام عضو…' },
  };
  const activeView = searchable[tab]?.view ?? null;
  const searchHint = tr(searchable[tab]?.hint ?? 'جستجوی زنده');

  if (visible.length === 0) {
    return <EmptyState title={tr("تبی برای شما فعال نیست")} description={tr("از مدیر بخواهید دسترسیِ تب‌های گزارش را بدهد.")} />;
  }

  const cards = [
    { label: 'تعداد پروژه', value: String(data.overall.projectCount), plain: true },
    { label: 'ارزش پروژه‌ها', value: format(data.overall.totalValue) },
    { label: 'هزینه‌های قابلِ صورت‌حساب', value: format(data.overall.expenses) },
    { label: 'دریافتی از کارفرما', value: format(data.overall.clientPaid) },
    { label: 'مطالبات از کارفرما', value: format(data.overall.clientDue), strong: true },
    { label: 'توافقیِ اعضا', value: format(data.overall.memberAgreed) },
    { label: 'پرداختی به اعضا', value: format(data.overall.memberPaid) },
    { label: 'بدهی به اعضا', value: format(data.overall.memberDebt), strong: true },
    { label: 'ساعت کاری', value: hoursLabel(data.overall.minutes), plain: true },
  ];

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
              href={`/reports/export?tab=${tab}${tab === 'closings' && data.closings.active ? `&date=${data.closings.active}` : ''}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download className="size-3.5" />
              {tr("خروجی CSV")}
            </a>
          )}
        </div>
      )}

      {tab === 'overall' && (
        <div className="grid gap-3">
        {data.isOwner && <RecomputeEurButton />}
        <div className="grid gap-3 @3xl/main:grid-cols-3 @xl/main:grid-cols-2">
          {cards.map((c) => (
            <Card key={c.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">{tr(c.label)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`num ${c.strong ? 'text-xl font-semibold' : 'text-lg font-medium'}`}>
                  {c.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        </div>
      )}

      {tab === 'members' && (
        data.members.length === 0 ? <EmptyState title={tr("داده‌ای نیست")} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("عضو")}</TableHead>
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
                  </TableCell>
                  <TableNumericCell>{format(m.agreed)}</TableNumericCell>
                  <TableNumericCell>{format(m.paid)}</TableNumericCell>
                  <TableNumericCell className={Number(m.remaining) > 0 ? 'text-amber-600 dark:text-amber-500' : ''}>
                    {format(m.remaining)}
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
        )
      )}

      {tab === 'clients' && (
        data.clients.length === 0 ? <EmptyState title={tr("کارفرمایی به پروژه‌ای وصل نیست")} /> : (
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
                  </TableCell>
                  <TableNumericCell>{format(c.price)}</TableNumericCell>
                  <TableNumericCell>{format(c.expenses)}</TableNumericCell>
                  <TableNumericCell>{format(c.paid)}</TableNumericCell>
                  <TableNumericCell className={Number(c.due) > 0 ? 'text-amber-600 dark:text-amber-500' : ''}>
                    {format(c.due)}
                  </TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      {tab === 'expenses' && (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">{tr("مجموع درآمد")}</CardTitle>
              </CardHeader>
              <CardContent><p className="num text-lg font-semibold">{format(data.expenses.totalIn)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-normal text-muted-foreground">{tr("مجموع هزینه")}</CardTitle>
              </CardHeader>
              <CardContent><p className="num text-lg font-semibold">{format(data.expenses.totalOut)}</p></CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            {tr("⚠️ انتقال‌های داخلی بینِ حساب‌ها در این جمع شمرده نمی‌شوند — پول از شرکت خارج نشده.")}
          </p>

          {data.expenses.rows.length === 0 ? <EmptyState title={tr("ردیفی نیست")} /> : (
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
                {expensesView.rows.map((r, i) => (
                  <TableRow key={i}>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      {tab === 'hours' && (
        data.hours.length === 0 ? <EmptyState title={tr("ساعتِ کاری ثبت نشده")} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("پروژه")}</TableHead>
                <TableHead>{tr("ساعت کاری")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hoursView.rows.map((h) => (
                <TableRow key={h.projectId}>
                  <TableCell>{h.title}</TableCell>
                  <TableNumericCell>{hoursLabel(h.minutes)}</TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
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
                    <Link href={`/projects/${p.id}`} className="hover:underline">{p.title}</Link>
                  </TableCell>
                  <TableCell>
                    {p.statusName ? (
                      <Badge
                        variant="outline"
                        style={p.statusColor ? { borderColor: p.statusColor } : undefined}
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{tr("تاریخِ بستن:")}</span>
              {data.closings.dates.map((d) => (
                <Link
                  key={d}
                  href={`/reports?tab=closings&date=${d}`}
                  className={`num rounded-md border px-3 py-1 text-xs ${
                    d === data.closings.active ? 'border-primary font-medium' : 'hover:bg-muted'
                  }`}
                >
                  {d}
                </Link>
              ))}
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

