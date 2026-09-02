import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { getClientDetail } from '@/server/reports/service';
import { ForbiddenError } from '@/domain/access/guard';
import { can } from '@/domain/access/permissions';
import { format } from '@/domain/money/money';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClientProjectsTable } from '../../detail-tables';
import { primeTranslations, t } from '@/i18n/server';

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
        <EmptyState title={t("کارفرما پیدا نشد")} />
      </main>
    );
  }

  const canOpen = actor.roles.includes('owner') || can(actor, 'projects.manage');
  const cards = [
    { label: 'ارزشِ کل (یورو)', value: format(data.totals.billed), warn: false },
    { label: 'دریافتیِ کل (یورو)', value: format(data.totals.received), warn: false },
    { label: 'مانده کل (یورو)', value: format(data.totals.due), warn: Number(data.totals.due) > 0 },
  ];

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header className="grid gap-1">
        <Link
          href="/reports?tab=clients"
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-3.5" />
          {t("بازگشت به گزارش‌ها")}
        </Link>
        <h1 className="text-xl font-semibold">{data.person.name}</h1>
        <p className="text-sm text-muted-foreground">{data.person.email}</p>
      </header>

      {data.rateMissing > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {t('{n} ردیف نرخِ تبدیل به ارزِ پایه ندارد و در این ارقام صفر شمرده شده. نرخ را در تنظیمات اضافه کنید.', { n: data.rateMissing })}
        </p>
      )}

      <div className="grid gap-3 @xl/main:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2"><CardTitle className="text-xs font-normal text-muted-foreground">{t(c.label)}</CardTitle></CardHeader>
            <CardContent><p className={`num text-xl font-semibold ${c.warn ? 'text-amber-600 dark:text-amber-500' : ''}`}>{c.value}</p></CardContent>
          </Card>
        ))}
      </div>

      {data.projects.length === 0 ? (
        <EmptyState title={t("این کارفرما به پروژه‌ای وصل نیست")} />
      ) : (
        <ClientProjectsTable rows={data.projects} lines={data.lines} canOpen={canOpen} />
      )}
    </main>
  );
}
