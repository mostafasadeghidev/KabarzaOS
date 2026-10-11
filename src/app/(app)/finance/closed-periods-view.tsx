'use client';

import Link from 'next/link';
import { Download, Eye, Lock, LockOpen, Settings2 } from 'lucide-react';
import { format } from '@/domain/money/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/page-shell';
import {
  Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';
import { ltr } from '@/i18n/bidi';

export interface ClosedPeriod {
  closeDate: string;
  /** آغازِ دوره — دورهٔ بی‌خلاصه (قفلِ دستیِ قدیمی) ندارد. */
  periodStart: string | null;
  /** بعداً بازگشایی شده؛ در تاریخچه می‌ماند. */
  reopened: boolean;
  accounts: Array<{
    accountId: number; accountName: string; currencyCode: string | null;
    deposits: string; withdrawals: string; closingBalance: string;
  }>;
}

/**
 * تبِ «دوره‌های بسته» (۲.۲۵.۰) — جای نوارِ قفل در بالای دفترکل.
 *
 * ⚠️ با بستنِ سالانه دوره‌ها روی هم جمع می‌شوند؛ یک نوار در دفترکل فقط آخرینش را
 * می‌گفت و هر بار نگاه را می‌کشید. اینجا هر دوره کارتِ خودش را دارد: بازه، ماندهٔ
 * منجمدِ هر حساب، و دیدن/خروجیِ ردیف‌های همان بازه (همان فیلترِ تاریخِ دفترکل).
 */
export function ClosedPeriodsView({ periods, isOwner }: { periods: ClosedPeriod[]; isOwner: boolean }) {
  const t = useT();

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('ردیف‌های دورهٔ بسته در دفترکل نشان داده نمی‌شوند و تغییر نمی‌کنند؛ ماندهٔ آخرشان به دورهٔ بعد منتقل شده است.')}
        </p>
        {/* بستن/بازکردنِ دوره فقط کارِ مالک است. */}
        {isOwner && (
          <Button asChild size="sm" variant="outline">
            <Link href="/settings?tab=fiscal"><Settings2 className="size-4" />{t('مدیریتِ دورهٔ مالی')}</Link>
          </Button>
        )}
      </div>

      {periods.map((p) => (
        <Panel
          key={p.closeDate}
          icon={p.reopened ? <LockOpen /> : <Lock />}
          title={p.periodStart
            ? t('{from} تا {to}', { from: ltr(p.periodStart), to: ltr(p.closeDate) })
            : t('تا {to}', { to: ltr(p.closeDate) })}
          actions={p.reopened
            ? <Badge variant="outline">{t('بازگشایی‌شده')}</Badge>
            : <Badge variant="secondary">{t('بسته')}</Badge>}
        >
          {p.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('برای این دوره خلاصهٔ حسابی ثبت نشده است.')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('حساب')}</TableHead>
                  <TableHead numeric>{t('مجموع واریز')}</TableHead>
                  <TableHead numeric>{t('مجموع برداشت')}</TableHead>
                  <TableHead numeric>{t('ماندهٔ پایانِ دوره')}</TableHead>
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.accounts.map((a) => {
                  const range = `account=${a.accountId}${p.periodStart ? `&from=${p.periodStart}` : ''}&to=${p.closeDate}`;
                  return (
                    <TableRow key={a.accountId}>
                      <TableCell className="font-medium">{a.accountName}</TableCell>
                      <TableNumericCell>{format(a.deposits)} {a.currencyCode ?? ''}</TableNumericCell>
                      <TableNumericCell>{format(a.withdrawals)} {a.currencyCode ?? ''}</TableNumericCell>
                      <TableNumericCell className="font-semibold">{format(a.closingBalance)} {a.currencyCode ?? ''}</TableNumericCell>
                      <TableActionsCell>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/finance?${range}&all=1`}><Eye className="size-3.5" />{t('ردیف‌ها')}</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <a href={`/finance/export?${range}&all=1`}><Download className="size-3.5" />{t('خروجی CSV')}</a>
                        </Button>
                      </TableActionsCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Panel>
      ))}
    </div>
  );
}
