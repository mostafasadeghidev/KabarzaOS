'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format } from '@/domain/money/money';
import { hoursLabel } from '@/domain/reports/summary';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { TablePager, TableSearch, useTableView } from '@/components/ui/table-search';
import { useT } from '@/i18n/client';

/**
 * جدول‌های ریزِ عضو/کارفرما در گزارش‌ها — پورتِ `member-detail.php` /
 * `client-detail.php`: جستجوی نامِ پروژه، ردیفِ هر پروژه در ارزِ **خودش**،
 * ردیف‌های پرداخت/هزینه زیرِ همان پروژه با ارز و رسید.
 */

export const STATUS_LABEL: Record<string, string> = {
  unpaid: 'پرداخت‌نشده',
  partial: 'پرداختِ جزئی',
  paid: 'تسویه‌شده',
};

export interface PaymentLine {
  projectId: number;
  date: string | null;
  amount: string;
  currencyCode: string | null;
  note: string;
  receiptIds: number[] | null;
}

function Lines({ lines, showNote }: { lines: PaymentLine[]; showNote: boolean }) {
  const t = useT();
  if (lines.length === 0) return null;
  return (
    <table className="mt-1 w-full text-xs text-muted-foreground">
      <thead>
        <tr>
          <th className="text-start font-normal">{t("تاریخ")}</th>
          <th className="text-start font-normal">{t("مبلغ")}</th>
          {showNote && <th className="text-start font-normal">{t("شرح")}</th>}
          <th className="text-start font-normal">{t("رسید")}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td className="num" dir="ltr">{l.date ?? '—'}</td>
            <td className="num">{format(l.amount)} {l.currencyCode ?? ''}</td>
            {showNote && <td>{l.note || '—'}</td>}
            <td>
              {(l.receiptIds?.length ?? 0) > 0
                ? <a href={`/api/files/${l.receiptIds![0]}`} target="_blank" rel="noopener noreferrer" className="underline">{t("مشاهده")}</a>
                : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface MemberProjectRow {
  projectId: number;
  title: string;
  currencyCode: string | null;
  agreed: string;
  paid: string;
  remaining: string;
  status: string;
  minutes: number;
}

export function MemberProjectsTable({
  rows,
  lines,
  canOpen,
}: {
  rows: MemberProjectRow[];
  lines: PaymentLine[];
  canOpen: boolean;
}) {
  const t = useT();
  const view = useTableView(rows, (r) => r.title, 15);
  const linesOf = (id: number) => lines.filter((l) => l.projectId === id);
  return (
    <div className="grid gap-2">
      <TableSearch view={view} placeholder={t("جستجوی نام پروژه…")} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("پروژه")}</TableHead>
            <TableHead>{t("توافق‌شده")}</TableHead>
            <TableHead>{t("پرداخت‌شده")}</TableHead>
            <TableHead>{t("مانده")}</TableHead>
            <TableHead>{t("وضعیت")}</TableHead>
            <TableHead>{t("ساعت کاری")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.rows.map((p) => (
            <TableRow key={p.projectId}>
              <TableCell>
                {canOpen
                  ? <Link href={`/projects/${p.projectId}?tab=finance`} className="hover:underline">{p.title}</Link>
                  : p.title}
                <Lines lines={linesOf(p.projectId)} showNote={false} />
              </TableCell>
              <TableNumericCell>{format(p.agreed)} {p.currencyCode ?? ''}</TableNumericCell>
              <TableNumericCell>{format(p.paid)} {p.currencyCode ?? ''}</TableNumericCell>
              <TableNumericCell className={Number(p.remaining) > 0.001 ? 'font-semibold text-amber-600 dark:text-amber-500' : 'font-semibold'}>
                {format(p.remaining)} {p.currencyCode ?? ''}
              </TableNumericCell>
              <TableCell>
                <Badge variant={p.status === 'paid' ? 'success' : p.status === 'unpaid' ? 'outline' : 'secondary'}>
                  {t(STATUS_LABEL[p.status] ?? p.status)}
                </Badge>
              </TableCell>
              <TableNumericCell>{hoursLabel(p.minutes)}</TableNumericCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePager view={view} />
    </div>
  );
}

export interface ClientProjectRow {
  projectId: number;
  title: string;
  currencyCode: string | null;
  statusName: string | null;
  price: string;
  expenses: string;
  paid: string;
  remaining: string;
  status: string;
  shared: boolean;
}

export function ClientProjectsTable({
  rows,
  lines,
  canOpen,
}: {
  rows: ClientProjectRow[];
  lines: PaymentLine[];
  canOpen: boolean;
}) {
  const t = useT();
  const view = useTableView(rows, (r) => r.title, 15);
  const linesOf = (id: number) => lines.filter((l) => l.projectId === id);
  return (
    <div className="grid gap-2">
      <TableSearch view={view} placeholder={t("جستجوی نام پروژه…")} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("پروژه")}</TableHead>
            <TableHead>{t("وضعیت")}</TableHead>
            <TableHead>{t("قیمت")}</TableHead>
            <TableHead>{t("هزینه‌های قابلِ صورت‌حساب")}</TableHead>
            <TableHead>{t("دریافت‌شده")}</TableHead>
            <TableHead>{t("مانده")}</TableHead>
            <TableHead>{t("تسویه")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.rows.map((p) => (
            <TableRow key={p.projectId}>
              <TableCell>
                {canOpen
                  ? <Link href={`/projects/${p.projectId}?tab=finance`} className="hover:underline">{p.title}</Link>
                  : p.title}
                {/* پورتِ نشانِ «شریک»: پروژهٔ مشترک که این کارفرما اصلی‌اش نیست — چیزی بدهکار نیست. */}
                {p.shared && (
                  <Badge variant="outline" className="ms-1.5 text-[10px]" title={t("پروژهٔ مشترک؛ صورت‌حساب به کارفرمای اصلی می‌رود.")}>
                    {t("شریک")}
                  </Badge>
                )}
                <Lines lines={linesOf(p.projectId)} showNote />
              </TableCell>
              <TableCell>{p.statusName ? <Badge variant="secondary">{p.statusName}</Badge> : '—'}</TableCell>
              <TableNumericCell>{format(p.price)} {p.currencyCode ?? ''}</TableNumericCell>
              <TableNumericCell>{format(p.expenses)} {p.currencyCode ?? ''}</TableNumericCell>
              <TableNumericCell>{format(p.paid)} {p.currencyCode ?? ''}</TableNumericCell>
              <TableNumericCell className={Number(p.remaining) > 0.001 ? 'font-semibold text-amber-600 dark:text-amber-500' : 'font-semibold'}>
                {format(p.remaining)} {p.currencyCode ?? ''}
              </TableNumericCell>
              <TableCell>
                <Badge variant={p.status === 'paid' ? 'success' : p.status === 'unpaid' ? 'outline' : 'secondary'}>
                  {t(STATUS_LABEL[p.status] ?? p.status)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePager view={view} />
    </div>
  );
}
