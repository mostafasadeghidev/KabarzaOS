'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, Paperclip } from 'lucide-react';
import type { MyClientProject, MyMemberProject, MyPaymentLine } from '@/server/finance/my-money';
import { format } from '@/domain/money/money';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';

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
    ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-500'
    : status === 'partial'
      ? 'border-amber-500/40 text-amber-600 dark:text-amber-500'
      : 'border-muted-foreground/30 text-muted-foreground';
  return <Badge variant="outline" className={tone}>{t(STATUS_LABEL[status] ?? status)}</Badge>;
}

function money(value: string, code: string | null) {
  return `${format(value)}${code ? ` ${code}` : ''}`;
}

/** جدولِ ردیف‌های پرداخت — تاریخ، مبلغ، معادلِ محاسبه‌شده، توضیح، رسید. */
function PaymentLines({
  lines, currencyCode, showCounted = true,
}: { lines: MyPaymentLine[]; currencyCode: string | null; showCounted?: boolean }) {
  const t = useT();
  if (lines.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('ردیفی ثبت نشده.')}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('تاریخ')}</TableHead>
            <TableHead>{t('مبلغ')}</TableHead>
            {showCounted && <TableHead>{t('معادل (محاسبه)')}</TableHead>}
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
    </div>
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
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-primary"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
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
          <Link href={href} className="text-primary hover:underline">{t('پروژه')} →</Link>
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

  if (!isMember && !isClient) {
    return <EmptyState title={t('اطلاعات مالی‌ای برای نمایش نیست')} />;
  }

  return (
    <div className="grid gap-6">
      {isClient && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">{t('صورت‌حسابِ پروژه‌های شما (کارفرما)')}</h2>
          {clientProjects.length === 0 ? (
            <EmptyState title={t('پروژه‌ای ندارید')} />
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
                    <h3 className="mb-1 text-xs font-semibold">{t('پرداخت‌های شما')}</h3>
                    <PaymentLines lines={p.payments} currencyCode={p.currencyCode} />
                  </div>
                  {/* جدولِ جدا، نه ستونِ «نوع» — پورتِ «هزینه‌های انجام‌شده برای این پروژه». */}
                  {p.expenses.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-xs font-semibold">{t('هزینه‌های انجام‌شده برای این پروژه')}</h3>
                      <PaymentLines lines={p.expenses} currencyCode={p.currencyCode} />
                    </div>
                  )}
                </Row>
              ))}
            </div>
          )}
        </section>
      )}

      {isClient && noProjectIncoming.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">{t('پرداخت‌های بدون پروژه')}</h2>
          <PaymentLines lines={noProjectIncoming} currencyCode={null} showCounted={false} />
        </section>
      )}

      {isMember && (
        <section className="grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('دریافتی‌های شما (عضوِ تیم)')}</h2>
            <Link href={bankHref} className="text-xs text-primary hover:underline">
              {t('اطلاعاتِ حسابِ بانکی')} →
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {tr('برای پروژه‌هایی که هنوز کامل پرداخت نشده‌اند می‌توانید از صفحهٔ پروژه درخواستِ پرداخت ثبت کنید (حداکثر تا ماندهٔ خودتان).')}
          </p>
          {memberProjects.length === 0 ? (
            <EmptyState title={t('پروژه‌ای ندارید')} />
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
                      <h3 className="mb-1 text-xs font-semibold">{t('کارکردِ تعدادی')}</h3>
                      {p.units.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t('هنوز ردیفی ثبت نشده.')}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('تاریخ')}</TableHead>
                                <TableHead>{t('تعداد')}</TableHead>
                                <TableHead>{t('مبلغ')}</TableHead>
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
                                    {u.isPaid ? `✅ ${t('پرداخت‌شده')}` : t('پرداخت‌نشده')}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="mb-1 text-xs font-semibold">{t('پرداختی‌های شما')}</h3>
                    <PaymentLines lines={p.payouts} currencyCode={p.currencyCode} />
                  </div>

                  {p.requests.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-xs font-semibold">{t('درخواست‌های پرداخت')}</h3>
                      <ul className="grid gap-1 text-xs">
                        {p.requests.map((r) => (
                          <li key={r.id} className="flex flex-wrap items-center gap-2">
                            <b className="num">{money(r.amount, r.currencyCode)}</b>
                            <span className="num text-muted-foreground">{r.createdAt.slice(0, 10)}</span>
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
        </section>
      )}

      {isMember && noProjectPayouts.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">{t('دریافتی‌های بدون پروژه')}</h2>
          <PaymentLines lines={noProjectPayouts} currencyCode={null} showCounted={false} />
        </section>
      )}
    </div>
  );
}
