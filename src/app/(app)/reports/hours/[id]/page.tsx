import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { getMemberHours } from '@/server/reports/service';
import { ForbiddenError } from '@/domain/access/guard';
import { hoursLabel } from '@/domain/reports/summary';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { primeTranslations, t } from '@/i18n/server';
import { HoursFilter } from './hours-filter';

/**
 * ریزِ ساعتِ کاریِ یک عضو — پورتِ نمای drill-down نسخهٔ قبلی.
 *
 * ⚠️ دو نما: بدونِ پروژهٔ انتخابی جمعِ هر پروژه، با پروژهٔ انتخابی ریزِ
 * روزبه‌روز. لینکِ هر ردیف همان صفحه با `project=` است، پس فیلترِ بازه
 * حفظ می‌شود.
 */
export default async function MemberHoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; project?: string }>;
}) {
  /**
   * ⚠️ هر صفحه **خودش** ترجمه را آماده می‌کند و به چیدمان تکیه نمی‌کند:
   * در ناوبریِ سمتِ کلاینت، Next فقط بخشِ صفحه را دوباره رندر می‌کند و
   * چیدمان را از درختِ کش‌شده برمی‌دارد — پس `primeTranslations()` ِ
   * چیدمان اجرا نمی‌شود و `t()` رشتهٔ فارسیِ مبدأ را برمی‌گرداند.
   * `cache()` تضمین می‌کند در هر درخواست فقط یک بار اجرا شود.
   */
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const userId = Number((await params).id);
  const query = await searchParams;

  let data;
  try {
    data = await getMemberHours(actor, userId, {
      from: query.from || null,
      to: query.to || null,
      projectId: Number(query.project) || null,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <main className="p-6">
          <EmptyState title={t('دسترسی ندارید')} />
        </main>
      );
    }
    throw error;
  }

  if (!data) {
    return (
      <main className="p-6">
        <EmptyState title={t('عضو یافت نشد')} />
      </main>
    );
  }

  const selectedId = Number(query.project) || null;

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <div>
        <Link
          href="/reports?tab=hours"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-3.5 rtl:rotate-0 ltr:rotate-180" />
          {t('بازگشت به گزارش‌ها')}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{data.member.name}</h1>
        <p className="text-sm text-muted-foreground">{data.member.email}</p>
      </div>

      <HoursFilter
        userId={userId}
        projects={data.byProject.map((p) => ({ id: p.projectId, title: p.title }))}
      />

      <div className="grid gap-3 @xl/main:grid-cols-3">
        {[
          { label: t('مجموع ساعت'), value: hoursLabel(data.totals.all) },
          { label: t('ساعتِ پروژه‌ها'), value: hoursLabel(data.totals.project) },
          { label: t('ساعتِ عمومی'), value: hoursLabel(data.totals.general) },
        ].map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-normal text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent className="num text-2xl font-semibold">{c.value}</CardContent>
          </Card>
        ))}
      </div>

      {selectedId === null ? (
        data.byProject.length === 0 && data.totals.general === 0 ? (
          <EmptyState title={t('در این بازه ساعتی ثبت نشده')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('پروژه')}</TableHead>
                <TableHead>{t('ساعت کاری')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byProject.map((r) => (
                <TableRow key={r.projectId}>
                  <TableCell>
                    <Link
                      href={`/reports/hours/${userId}?project=${r.projectId}${query.from ? `&from=${query.from}` : ''}${query.to ? `&to=${query.to}` : ''}`}
                      className="hover:underline"
                    >
                      {r.title}
                    </Link>
                  </TableCell>
                  <TableNumericCell>{hoursLabel(r.minutes)}</TableNumericCell>
                </TableRow>
              ))}
              {/* ⚠️ کارِ عمومی ردیفِ خودش را دارد، وگرنه جمع با ستون نمی‌خواند. */}
              {data.totals.general > 0 && (
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    {t('بدون پروژه (کارِ عمومی)')}
                  </TableCell>
                  <TableNumericCell>{hoursLabel(data.totals.general)}</TableNumericCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )
      ) : (
        data.entries.length === 0 ? (
          <EmptyState title={t('در این بازه ساعتی ثبت نشده')} />
        ) : (
          <div className="grid gap-2">
            <p className="text-sm font-medium">{data.selectedProject ?? ''}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('تاریخ')}</TableHead>
                  <TableHead>{t('ساعت کاری')}</TableHead>
                  <TableHead>{t('شرح')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableNumericCell>{e.logDate}</TableNumericCell>
                    <TableNumericCell>{hoursLabel(e.minutes)}</TableNumericCell>
                    <TableCell>{e.description || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </main>
  );
}
