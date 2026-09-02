import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { getMemberDetail } from '@/server/reports/service';
import { ForbiddenError } from '@/domain/access/guard';
import { can } from '@/domain/access/permissions';
import { format } from '@/domain/money/money';
import { hoursLabel } from '@/domain/reports/summary';
import { formatSlots } from '@/domain/availability/weekly';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Thumb } from '@/components/thumb';
import { MemberProjectsTable } from '../../detail-tables';
import { primeTranslations, t } from '@/i18n/server';

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
        <main className="p-6">
          <EmptyState title={t("دسترسی ندارید")} description={t("دیدنِ گزارش‌ها مجوزِ جداگانه دارد.")} />
        </main>
      );
    }
    throw error;
  }

  if (!data) {
    return (
      <main className="p-6">
        <EmptyState title={t("عضو پیدا نشد")} />
      </main>
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
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header className="grid gap-1">
        <Link
          href="/reports?tab=members"
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-3.5" />
          {t("بازگشت به گزارش‌ها")}
        </Link>
        <div className="flex items-center gap-3">
          <Thumb id={data.person.id} title={data.person.name} fileId={data.person.avatarFileId} size={48} />
          <div>
            <h1 className="text-xl font-semibold">{data.person.name}</h1>
            <p className="text-sm text-muted-foreground">
              {data.person.roleNames.length > 0 ? data.person.roleNames.join('، ') : data.person.email}
            </p>
          </div>
        </div>
      </header>

      {data.rateMissing > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {t('{n} ردیف نرخِ تبدیل به ارزِ پایه ندارد و در این ارقام صفر شمرده شده. نرخ را در تنظیمات اضافه کنید.', { n: data.rateMissing })}
        </p>
      )}

      <div className="grid gap-3 @xl/main:grid-cols-3">
        {moneyCards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-normal text-muted-foreground">{t(c.label)}</CardTitle></CardHeader>
            <CardContent><p className={`num text-xl font-semibold ${c.warn ? 'text-amber-600 dark:text-amber-500' : ''}`}>{c.value}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* پورتِ کارت‌های عملیاتیِ «۳۶۰». */}
      <div className="grid gap-3 @xl/main:grid-cols-5 @md/main:grid-cols-2">
        {opCards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-normal text-muted-foreground">{t(c.label)}</CardTitle></CardHeader>
            <CardContent><p className="num text-lg font-semibold">{c.value}</p></CardContent>
          </Card>
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

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold">{t("تسک‌ها")}</h2>
        <div className="grid gap-3 @2xl/main:grid-cols-3">
          {taskSections.map((sec) => (
            <div key={sec.key} className="rounded-md border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t(sec.label)} <span className="num">{sec.groups.reduce((n, g) => n + g.tasks.length, 0)}</span>
              </p>
              {sec.groups.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : (
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
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">{t("در دسترسیِ هفتگی")}</h2>
        {data.ops.availability.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("برنامهٔ هفتگی ثبت نشده.")}</p>
        ) : (
          <ul className="grid gap-1 text-sm @md/main:grid-cols-2">
            {data.ops.availability.map((d) => (
              <li key={d.day} className="flex justify-between rounded-md border px-3 py-1.5">
                <span>{t(d.day)}</span>
                <span className="num text-muted-foreground">{formatSlots(d.slots, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
