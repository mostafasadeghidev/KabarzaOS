'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronLeft, Paperclip } from 'lucide-react';
import type { MyClientProject, MyMemberProject, MyPaymentLine } from '@/server/finance/my-money';
import { format } from '@/domain/money/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDate } from '@/i18n/datetime';
import { Section } from '@/components/page-shell';

/** برچسبِ وضعیتِ پرداخت — همان سه حالتِ `Payments::status_label`. */
const STATUS_LABEL: Record<string, string> = {
  unpaid: 'پرداخت‌نشده',
  partial: 'پرداختِ جزئی',
  paid: 'تسویه‌شده',
};

const REQUEST_LABEL: Record<string, string> = {
  pending: 'در انتظار',
  approved: 'تأییدشده',
  rejected: 'ردشده',
  paid: 'پرداخت‌شده',
};

function StatusChip({ status }: { status: string }) {
  const t = useT();
  const tone = status === 'paid'
    ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-500'
    : status === 'partial'
      ? 'border-amber-500/40 text-amber-700 dark:text-amber-500'
      : 'border-muted-foreground/30 text-muted-foreground';
  return <Badge variant="outline" className={tone}>{t(STATUS_LABEL[status] ?? status)}</Badge>;
}

function money(value: string, code: string | null) {
  return `${format(value)}${code ? ` ${code}` : ''}`;
}

/** جدولِ ردیف‌های پرداخت — تاریخ، مبلغ، معادلِ محاسبه‌شده، توضیح، رسید. */
function PaymentLines({
  lines, currencyCode, showCounted = true, frame = true,
}: {
  lines: MyPaymentLine[];
  currencyCode: string | null;
  showCounted?: boolean;
  /** داخلِ جعبهٔ بازشوندهٔ ردیف بی‌قاب — جعبه خودش قاب است. */
  frame?: boolean;
}) {
  const t = useT();
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('ردیفی ثبت نشده.')}</p>;
  }
  return (
    <Table frame={frame}>
      <TableHeader>
        <TableRow>
          <TableHead numeric>{t('تاریخ')}</TableHead>
          <TableHead numeric>{t('مبلغ')}</TableHead>
          {showCounted && <TableHead numeric>{t('معادل (محاسبه)')}</TableHead>}
          <TableHead>{t('توضیحات')}</TableHead>
          <TableHead>{t('رسید')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l) => (
          <TableRow key={l.id}>
            <TableNumericCell>{l.paidAt}</TableNumericCell>
            <TableNumericCell>{money(l.amount, l.currencyCode)}</TableNumericCell>
            {showCounted && (
              <TableNumericCell className="text-muted-foreground">
                {l.counted ? money(l.counted, currencyCode) : '—'}
              </TableNumericCell>
            )}
            <TableCell>{l.note || '—'}</TableCell>
            <TableCell>
              {l.receiptId ? (
                <a
                  href={`/api/files/${l.receiptId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Paperclip className="size-3" />
                  {t('مشاهده')}
                </a>
              ) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * یک پروژه به‌صورتِ ردیفِ بازشو — پورتِ `finance_row()`: خلاصه در سرِ ردیف،
 * جزئیات پس از باز کردن. کاربر معمولاً فقط ماندهٔ کل را می‌خواهد، نه ریز
 * تراکنش‌ها.
 */
function Row({
  title, href, chips, status, children,
}: {
  title: string;
  href: string;
  chips: Array<{ label: string; value: string; strong?: boolean }>;
  status: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-primary"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4 ltr:rotate-180" />}
          {title}
        </button>
        <StatusChip status={status} />
        <div className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {chips.map((c) => (
            <span key={c.label} className="text-muted-foreground">
              {t(c.label)}:{' '}
              <b className={`num ${c.strong ? 'text-sm text-foreground' : ''}`}>{c.value}</b>
            </span>
          ))}
          <Link href={href} className="inline-flex items-center gap-1 text-primary hover:underline">
            {t('پروژه')}
            <ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden />
          </Link>
        </div>
      </div>
      {open && <div className="grid gap-3 border-t bg-muted/30 p-3">{children}</div>}
    </div>
  );
}

export function MyMoneyView({
  memberProjects, clientProjects, noProjectPayouts, noProjectIncoming, isMember, isClient, bankHref,
}: {
  memberProjects: MyMemberProject[];
  clientProjects: MyClientProject[];
  noProjectPayouts: MyPaymentLine[];
  noProjectIncoming: MyPaymentLine[];
  isMember: boolean;
  isClient: boolean;
  bankHref: string;
}) {
  const t = useT();
  const tr = useT();
  const tz = useTimeZone();

  if (!isMember && !isClient) {
    return <EmptyState title={t('اطلاعات مالی‌ای برای نمایش نیست')} />;
  }

  return (
    <div className="grid gap-4 md:gap-6">
      {isClient && (
        <Section title={t('صورت‌حسابِ پروژه‌های شما (کارفرما)')}>
          {clientProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('پروژه‌ای ندارید')}</p>
          ) : (
            <div className="grid gap-2">
              {clientProjects.map((p) => (
                <Row
                  key={p.projectId}
                  title={p.title}
                  href={`/projects/${p.projectId}`}
                  status={p.status}
                  chips={[
                    { label: 'قیمت', value: money(p.price, p.currencyCode) },
                    { label: 'هزینه‌های قابلِ صورت‌حساب', value: money(p.billableExpenses, p.currencyCode) },
                    { label: 'جمعِ بدهی', value: money(p.totalDue, p.currencyCode) },
                    { label: 'پرداختی', value: money(p.paid, p.currencyCode) },
                    { label: 'مانده', value: money(p.remaining, p.currencyCode), strong: true },
                  ]}
                >
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{t('پرداخت‌های شما')}</h4>
                    <PaymentLines lines={p.payments} currencyCode={p.currencyCode} frame={false} />
                  </div>
                  {/* جدولِ جدا، نه ستونِ «نوع» — پورتِ «هزینه‌های انجام‌شده برای این پروژه». */}
                  {p.expenses.length > 0 && (
                    <div>
                      <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{t('هزینه‌های انجام‌شده برای این پروژه')}</h4>
                      <PaymentLines lines={p.expenses} currencyCode={p.currencyCode} frame={false} />
                    </div>
                  )}
                </Row>
              ))}
            </div>
          )}
        </Section>
      )}

      {isClient && noProjectIncoming.length > 0 && (
        <Section title={t('پرداخت‌های بدون پروژه')}>
          <PaymentLines lines={noProjectIncoming} currencyCode={null} showCounted={false} />
        </Section>
      )}

      {isMember && (
        <Section
          title={t('دریافتی‌های شما (عضوِ تیم)')}
          description={tr('برای پروژه‌هایی که هنوز کامل پرداخت نشده‌اند می‌توانید از صفحهٔ پروژه درخواستِ پرداخت ثبت کنید (حداکثر تا ماندهٔ خودتان).')}
          actions={(
            <Link href={bankHref} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              {t('اطلاعاتِ حسابِ بانکی')}
              <ArrowLeft className="size-3 ltr:rotate-180" aria-hidden />
            </Link>
          )}
        >
          {memberProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('پروژه‌ای ندارید')}</p>
          ) : (
            <div className="grid gap-2">
              {memberProjects.map((p) => (
                <Row
                  key={p.projectId}
                  title={p.title}
                  href={`/projects/${p.projectId}`}
                  status={p.isUnitBased ? (Number(p.unitUnpaid) > 0 ? 'partial' : 'paid') : p.status}
                  chips={p.isUnitBased
                    ? [
                      { label: 'پرداختی', value: money(p.unitPaid, p.currencyCode) },
                      { label: 'پرداخت‌نشده', value: money(p.unitUnpaid, p.currencyCode), strong: true },
                    ]
                    : [
                      { label: 'مبلغِ قرارداد', value: money(p.agreed, p.currencyCode) },
                      { label: 'پرداختی', value: money(p.paid, p.currencyCode) },
                      { label: 'مانده', value: money(p.remaining, p.currencyCode), strong: true },
                    ]}
                >
                  {p.isUnitBased && (
                    <div>
                      <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{t('کارکردِ تعدادی')}</h4>
                      {p.units.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('هنوز ردیفی ثبت نشده.')}</p>
                      ) : (
                        <Table frame={false}>
                          <TableHeader>
                            <TableRow>
                              <TableHead numeric>{t('تاریخ')}</TableHead>
                              <TableHead numeric>{t('تعداد')}</TableHead>
                              <TableHead numeric>{t('مبلغ')}</TableHead>
                              <TableHead>{t('وضعیت')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {p.units.map((u) => (
                              <TableRow key={u.id}>
                                <TableNumericCell>{u.entryDate}</TableNumericCell>
                                <TableNumericCell>{u.quantity}</TableNumericCell>
                                <TableNumericCell>{money(u.amount, p.currencyCode)}</TableNumericCell>
                                <TableCell>
                                  {u.isPaid ? (
                                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-500">
                                      {t('پرداخت‌شده')}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                                      {t('پرداخت‌نشده')}
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  )}

                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{t('پرداختی‌های شما')}</h4>
                    <PaymentLines lines={p.payouts} currencyCode={p.currencyCode} frame={false} />
                  </div>

                  {p.requests.length > 0 && (
                    <div>
                      <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{t('درخواست‌های پرداخت')}</h4>
                      <ul className="grid gap-1 text-xs">
                        {p.requests.map((r) => (
                          <li key={r.id} className="flex flex-wrap items-center gap-2">
                            <b className="num">{money(r.amount, r.currencyCode)}</b>
                            <span className="num text-muted-foreground">{formatDate(r.createdAt, tz)}</span>
                            <Badge variant="outline">{t(REQUEST_LABEL[r.status] ?? r.status)}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Row>
              ))}
            </div>
          )}
        </Section>
      )}

      {isMember && noProjectPayouts.length > 0 && (
        <Section title={t('دریافتی‌های بدون پروژه')}>
          <PaymentLines lines={noProjectPayouts} currencyCode={null} showCounted={false} />
        </Section>
      )}
    </div>
  );
}
