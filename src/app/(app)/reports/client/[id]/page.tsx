import { redirect } from 'next/navigation';
import { UserAvatar } from '@/components/user-avatar';
import { TriangleAlert } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { getClientDetail } from '@/server/reports/service';
import { ForbiddenError } from '@/domain/access/guard';
import { can } from '@/domain/access/permissions';
import { format } from '@/domain/money/money';
import { EmptyState } from '@/components/ui/empty-state';
import { ClientProjectsTable } from '../../detail-tables';
import { primeTranslations, t } from '@/i18n/server';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader, PageShell } from '@/components/page-shell';
import { StatCard } from '@/components/stat-card';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('گزارش‌ها');

/**
 * ریزِ مطالباتِ یک کارفرما — پورتِ `client_detail` ِ افزونه: کارت‌های یورو،
 * پروژه‌ها در ارزِ خودشان (قیمت / هزینه / دریافتی / مانده / وضعیت)، نشانِ
 * «شریک»، ردیف‌های هزینه با رسید، جستجو؛ پیوندِ پروژه فقط برای مدیرِ پروژه‌ها.
 */
export default async function ClientReportPage({ params }: { params: Promise<{ id: string }> }) {
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const id = Number((await params).id);

  let data;
  try {
    data = Number.isInteger(id) && id > 0 ? await getClientDetail(actor, id) : null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader back={{ href: '/reports?tab=clients', label: t("گزارش‌ها") }} title={t("گزارش‌ها")} />
          <EmptyState title={t("دسترسی ندارید")} description={t("دیدنِ گزارش‌ها مجوزِ جداگانه دارد.")} />
        </PageShell>
      );
    }
    throw error;
  }

  if (!data) {
    return (
      <PageShell>
        <PageHeader back={{ href: '/reports?tab=clients', label: t("گزارش‌ها") }} title={t("گزارش‌ها")} />
        <EmptyState title={t("کارفرما پیدا نشد")} />
      </PageShell>
    );
  }

  const canOpen = actor.roles.includes('owner') || can(actor, 'projects.manage');
  const cards = [
    { label: 'ارزشِ کل (یورو)', value: format(data.totals.billed), warn: false },
    { label: 'دریافتیِ کل (یورو)', value: format(data.totals.received), warn: false },
    { label: 'مانده کل (یورو)', value: format(data.totals.due), warn: Number(data.totals.due) > 0 },
  ];

  return (
    <PageShell>
      <PageHeader
        back={{ href: '/reports?tab=clients', label: t("گزارش‌ها") }}
        media={<UserAvatar userId={id} name={data.person.name} size="lg" />}
        title={data.person.name}
        description={data.person.email}
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
        {cards.map((c) => (
          <StatCard key={c.label} label={t(c.label)} value={c.value} tone={c.warn ? 'warning' : 'default'} />
        ))}
      </div>

      {data.projects.length === 0 ? (
        <EmptyState title={t("این کارفرما به پروژه‌ای وصل نیست")} />
      ) : (
        <ClientProjectsTable rows={data.projects} lines={data.lines} canOpen={canOpen} />
      )}
    </PageShell>
  );
}
