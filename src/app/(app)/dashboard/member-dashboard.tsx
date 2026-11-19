import Link from 'next/link';
import { Thumb } from '@/components/thumb';
import type { ClientSection } from '@/server/dashboard-member';
import { format } from '@/domain/money/money';
import { SecretAmount } from '@/components/secret-amount';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectStatus } from '../projects/project-status';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableDateCell, TableNumericCell, TableRow } from '@/components/ui/table';
import { t } from '@/i18n/server';
import { StatCard } from '@/components/stat-card';
import { Panel } from '@/components/page-shell';
import { Button } from '@/components/ui/button';

/**
 * بلوکِ کارفرما (کارت‌ها + جدولِ پروژه‌ها **با** قیمت / وضعیتِ پرداخت / مانده / تعدادِ تسک / پیشرفت /
 * ساعتِ تیم) — کارتِ «پروژه‌های من» در داشبوردِ تازه از آن استفاده می‌کند.
 * ⚠️ نمای کاملِ قدیمیِ عضو/کارفرما (MemberDashboardView) در ۳.۱۸.۱ با «نمای قبلی» برداشته شد.
 */

type MoneyLines = Array<{ currencyCode: string; total: string }>;

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`;
}

const PAY_LABELS: Record<string, string> = {
  unpaid: 'پرداخت‌نشده',
  partial: 'پرداختِ جزئی',
  paid: 'تسویه‌شده',
};

/**
 * کارتِ ماندهٔ باز — به «امور مالی» می‌برد.
 * ⚠️ به تفکیکِ ارز نوشته می‌شود؛ جمعِ چندارزی در یک عدد بی‌معناست.
 */
function MoneyStat({
  lines, label,
}: { lines: Array<{ currencyCode: string; total: string }>; label: string }) {
  return (
    <Card className="h-full gap-0 py-4 shadow-xs">
      <CardHeader className="gap-1.5 px-4">
        <CardDescription className="flex items-center justify-between gap-2">
          {label}
          {/* رفتن به صفحهٔ مالی، جدا از کلیکِ «نمایشِ مبلغ». */}
          <Button asChild size="xs" variant="outline"><Link href="/my-money">{t('جزئیات')}</Link></Button>
        </CardDescription>
        {/* ⚠️ صفر هم پوشیده است: اگر فقط رقمِ غیرِصفر پوشیده باشد، «•••» خودش
            می‌گوید «چیزی هست» و پوشش بی‌معنا می‌شود. */}
        {lines.length === 0 ? (
          <CardTitle className="text-xl font-semibold">
            <SecretAmount value="0" />
          </CardTitle>
        ) : (
          <div className="grid gap-1">
            {lines.map((l) => (
              <CardTitle key={l.currencyCode} className="num text-xl font-semibold">
                {/* رقم پیش‌فرض پوشیده است؛ با کلیک باز می‌شود. */}
                <SecretAmount value={`${format(l.total)} ${l.currencyCode}`} />
              </CardTitle>
            ))}
          </div>
        )}
      </CardHeader>
    </Card>
  );
}

export function ClientBlock({ data, unread, showUnread, money }: { data: ClientSection; unread: number; showUnread: boolean; money: MoneyLines }) {
  return (
    <>
      <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <StatCard value={data.stats.projects} label={t('پروژه‌ها (به‌عنوان کارفرما)')} href="/projects" />
        <StatCard value={data.stats.reviewTasks} label={t('تسک‌های نیازمند بررسی')} href="/tasks" />
        <StatCard value={data.stats.commentsToReview} label={t('کامنت‌های نیازمند بررسی')} href="/comments" />
        {showUnread && <StatCard value={unread} label={t('پیام‌های خوانده‌نشده')} href="/messages" />}
        <MoneyStat lines={money} label={t('ماندهٔ پرداختیِ شما')} />
      </div>

      <Panel title={t('پروژه‌های شما (به‌عنوان کارفرما)')}>
        {data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('پروژه‌ای ندارید.')}</p>
        ) : (
          <Table frame={false}>
            <TableHeader>
              <TableRow>
                <TableHead>{t('نام')}</TableHead>
                {/* ⚠️ سرستون و مقدار باید یک‌جور تراز شوند؛ ستونِ عددی
                    مقدارش `text-end` بود و سرستونش نه — در راست‌به‌چپ
                    عدد زیرِ سرستونِ خودش دیده نمی‌شد. */}
                <TableHead>{t('تاریخ ثبت')}</TableHead>
                <TableHead numeric>{t('قیمت')}</TableHead>
                <TableHead>{t('وضعیت پروژه')}</TableHead>
                <TableHead>{t('وضعیت پرداخت')}</TableHead>
                <TableHead numeric>{t('مانده')}</TableHead>
                <TableHead numeric>{t('تعداد تسک‌ها')}</TableHead>
                <TableHead numeric>{t('درصد پیشرفت')}</TableHead>
                <TableHead numeric>{t('ساعت کاری تیم')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {/* بندانگشتیِ پروژه کنارِ نام — `Projects::thumb_html` (dash-3 #3/#8). */}
                    <Link href={`/projects/${p.id}`} className="inline-flex items-center gap-2 hover:underline">
                      <Thumb id={p.id} title={p.title} fileId={p.thumbnailFileId} size={32} />
                      {p.title}
                    </Link>
                  </TableCell>
                  <TableDateCell>{p.regDate ?? '—'}</TableDateCell>
                  <TableNumericCell>
                    <SecretAmount value={`${format(p.price)} ${p.currencyCode ?? ''}`} />
                  </TableNumericCell>
                  <TableCell><ProjectStatus name={p.statusName} group={p.statusGroup} color={p.statusColor} /></TableCell>
                  <TableCell>
                    <Badge variant={p.paymentStatus === 'paid' ? 'success' : p.paymentStatus === 'partial' ? 'warning' : 'outline'}>
                      {t(PAY_LABELS[p.paymentStatus] ?? p.paymentStatus)}
                    </Badge>
                  </TableCell>
                  <TableNumericCell>
                    <SecretAmount value={`${format(String(p.remaining))} ${p.currencyCode ?? ''}`} />
                  </TableNumericCell>
                  <TableNumericCell>{p.taskCount}</TableNumericCell>
                  <TableNumericCell>{p.percent}%</TableNumericCell>
                  <TableNumericCell>{hours(p.teamMinutes)}</TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
