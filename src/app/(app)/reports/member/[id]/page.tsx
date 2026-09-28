import { redirect } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { getMemberDetail } from '@/server/reports/service';
import { ForbiddenError } from '@/domain/access/guard';
import { can } from '@/domain/access/permissions';
import { format } from '@/domain/money/money';
import { hoursLabel } from '@/domain/reports/summary';
import { formatSlots } from '@/domain/availability/weekly';
import { EmptyState } from '@/components/ui/empty-state';
import { Thumb } from '@/components/thumb';
import { MemberProjectsTable } from '../../detail-tables';
import { primeTranslations, t } from '@/i18n/server';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader, PageShell, Section } from '@/components/page-shell';
import { StatCard } from '@/components/stat-card';

/**
 * ریزِ کارِ یک عضو در گزارش‌ها — پورتِ `member_detail` ِ افزونه: کارت‌های یورو،
 * کارت‌های عملیاتی (پروژه / ساعتِ این هفته / تسک‌ها / دسترس‌پذیری)، جدولِ
 * پروژه‌ها در ارزِ خودشان با ردیف‌های پرداخت، تسک‌ها در سه سطل، برنامهٔ هفتگی.
 */
export default async function MemberReportPage({ params }: { params: Promise<{ id: string }> }) {
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const id = Number((await params).id);

  let data;
  try {
    data = Number.isInteger(id) && id > 0 ? await getMemberDetail(actor, id) : null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader back={{ href: '/reports?tab=members', label: t("گزارش‌ها") }} title={t("گزارش‌ها")} />
          <EmptyState title={t("دسترسی ندارید")} description={t("دیدنِ گزارش‌ها مجوزِ جداگانه دارد.")} />
        </PageShell>
      );
    }
    throw error;
  }

  if (!data) {
    return (
      <PageShell>
        <PageHeader back={{ href: '/reports?tab=members', label: t("گزارش‌ها") }} title={t("گزارش‌ها")} />
        <EmptyState title={t("عضو پیدا نشد")} />
      </PageShell>
    );
  }

  const canOpen = actor.roles.includes('owner') || can(actor, 'projects.manage');
  const moneyCards = [
    { label: 'تعهد کل (یورو)', value: format(data.totals.agreed), warn: false },
    { label: 'پرداخت‌شده (یورو)', value: format(data.totals.paid), warn: false },
    { label: 'بدهی (یورو)', value: format(data.totals.debt), warn: Number(data.totals.debt) > 0 },
  ];
  const openCount = data.ops.tasks.open.reduce((n, g) => n + g.tasks.length, 0)
    + data.ops.tasks.review.reduce((n, g) => n + g.tasks.length, 0);
  const doneCount = data.ops.tasks.done.reduce((n, g) => n + g.tasks.length, 0);
  const opCards = [
    { label: 'پروژه', value: String(data.projects.length) },
    { label: 'ساعتِ این هفته', value: hoursLabel(data.ops.weekMinutes) },
    { label: 'تسکِ مانده', value: String(openCount) },
    { label: 'تسکِ تمام‌شده', value: String(doneCount) },
    { label: 'در دسترسیِ هفتگی', value: t('{n} روز', { n: data.ops.availability.length }) },
  ];
  const taskSections = [
    { key: 'open', label: 'در حال انجام', groups: data.ops.tasks.open },
    { key: 'review', label: 'نیازمند بررسی', groups: data.ops.tasks.review },
    { key: 'done', label: 'انجام‌شده', groups: data.ops.tasks.done },
  ];

  return (
    <PageShell>
      <PageHeader
        back={{ href: '/reports?tab=members', label: t("گزارش‌ها") }}
        media={<Thumb id={data.person.id} title={data.person.name} fileId={data.person.avatarFileId} size={48} />}
        title={data.person.name}
        description={data.person.roleNames.length > 0 ? data.person.roleNames.join('، ') : data.person.email}
      />

      {data.rateMissing > 0 && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            {t('{n} ردیف نرخِ تبدیل به ارزِ پایه ندارد و در این ارقام صفر شمرده شده. نرخ را در تنظیمات اضافه کنید.', { n: data.rateMissing })}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 @xl/main:grid-cols-3">
        {moneyCards.map((c) => (
          <StatCard key={c.label} label={t(c.label)} value={c.value} tone={c.warn ? 'warning' : 'default'} />
        ))}
      </div>

      {/* پورتِ کارت‌های عملیاتیِ «۳۶۰». */}
      <div className="grid gap-4 @md/main:grid-cols-2 @3xl/main:grid-cols-5">
        {opCards.map((c) => (
          <StatCard key={c.label} label={t(c.label)} value={c.value} />
        ))}
      </div>

      {data.ops.workedOn.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("کارِ این هفته")}: {data.ops.workedOn.map((w) => `${w.title} (${hoursLabel(w.minutes)})`).join(' · ')}
        </p>
      )}

      {data.projects.length === 0 ? (
        <EmptyState title={t("این عضو روی هیچ پروژه‌ای نیست")} />
      ) : (
        <MemberProjectsTable rows={data.projects} lines={data.lines} canOpen={canOpen} />
      )}

      <Section title={t("تسک‌ها")}>
        <div className="grid gap-3 @2xl/main:grid-cols-3">
          {taskSections.map((sec) => (
            <div key={sec.key} className="rounded-lg border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t(sec.label)} <span className="num">{sec.groups.reduce((n, g) => n + g.tasks.length, 0)}</span>
              </p>
              {sec.groups.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
                <ul className="grid gap-2">
                  {sec.groups.map((g) => (
                    <li key={g.projectId}>
                      <p className="text-xs font-medium">{g.title}</p>
                      <ul className="ms-3 grid gap-0.5 text-xs">
                        {g.tasks.map((tk, i) => (
                          <li key={i}>{tk.title}{tk.priority ? <span className="ms-1 text-muted-foreground">· {tk.priority}</span> : null}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title={t("در دسترسیِ هفتگی")}>
        {data.ops.availability.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("برنامهٔ هفتگی ثبت نشده.")}</p>
        ) : (
          <ul className="grid gap-1 text-sm @md/main:grid-cols-2">
            {data.ops.availability.map((d) => (
              <li key={d.day} className="flex justify-between rounded-lg border px-3 py-1.5">
                <span>{t(d.day)}</span>
                <span className="num text-muted-foreground">{formatSlots(d.slots, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </PageShell>
  );
}
