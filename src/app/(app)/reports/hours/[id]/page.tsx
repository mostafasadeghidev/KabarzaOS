import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { getMemberHours } from '@/server/reports/service';
import { ForbiddenError } from '@/domain/access/guard';
import { hoursLabel } from '@/domain/reports/summary';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { primeTranslations, t } from '@/i18n/server';
import { HoursFilter } from './hours-filter';
import { getSystemConfig } from '@/server/settings/system-service';
import { hoursRange, rangeLabel, reportQuery } from '@/domain/reports/filters';
import { PageHeader, PageShell } from '@/components/page-shell';
import { StatCard } from '@/components/stat-card';

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

  // پورتِ افزونه: بی‌پارامتر «این هفته» از روزِ شروعِ تنظیمات؛ حاضر ولی خالی «کل دوره».
  const today = new Date().toISOString().slice(0, 10);
  const { weekStart } = await getSystemConfig();
  const range = hoursRange({ from: query.from, to: query.to }, today, weekStart);
  const rangeParams = range.allTime ? 'from=&to=' : reportQuery({ from: range.from, to: range.to });

  let data;
  try {
    data = await getMemberHours(actor, userId, {
      from: range.from || null,
      to: range.to || null,
      projectId: Number(query.project) || null,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <EmptyState title={t('دسترسی ندارید')} />
        </PageShell>
      );
    }
    throw error;
  }

  if (!data) {
    return (
      <PageShell>
        <EmptyState title={t('عضو یافت نشد')} />
      </PageShell>
    );
  }

  const selectedId = Number(query.project) || null;

  return (
    <PageShell>
      <PageHeader
        back={{
          href: `/reports?tab=hours&${range.allTime ? 'hfrom=&hto=' : reportQuery({ hfrom: range.from, hto: range.to })}`,
          label: t('گزارش‌ها'),
        }}
        title={data.member.name}
        description={(
          <>
            {data.member.email}
            {/* پورتِ برچسبِ بازه زیرِ نام: «از … تا …» / «کل دوره». */}
            <span className="num ms-2">· {rangeLabel(range, t)}</span>
          </>
        )}
      />

      <HoursFilter
        userId={userId}
        projects={data.projectOptions.map((p) => ({ id: p.id, title: p.title }))}
        weekStart={weekStart}
      />

      <div className="grid gap-4 @xl/main:grid-cols-3">
        {[
          { label: t('مجموع ساعت'), value: hoursLabel(data.totals.all) },
          { label: t('ساعتِ پروژه‌ها'), value: hoursLabel(data.totals.project) },
          { label: t('ساعتِ عمومی'), value: hoursLabel(data.totals.general) },
        ].map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} />
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
                <TableHead numeric>{t('ساعت کاری')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byProject.map((r) => (
                <TableRow key={r.projectId}>
                  <TableCell>
                    <Link
                      href={`/reports/hours/${userId}?project=${r.projectId}&${rangeParams}`}
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
                  <TableHead numeric>{t('تاریخ')}</TableHead>
                  <TableHead numeric>{t('ساعت کاری')}</TableHead>
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
    </PageShell>
  );
}
