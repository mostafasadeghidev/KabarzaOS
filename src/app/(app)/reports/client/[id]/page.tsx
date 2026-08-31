import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { getClientDetail } from '@/server/reports/service';
import { ForbiddenError } from '@/domain/access/guard';
import { format } from '@/domain/money/money';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { t } from '@/i18n/server';

/**
 * ریزِ مطالباتِ یک کارفرما — پورتِ `client_detail()`.
 *
 * ⚠️ «بدهی» جمعِ قیمت و هزینه‌های **قابلِ‌صورتحساب** منهای دریافتی است
 * (R-TEAM-04)؛ هزینهٔ جذب‌شده اینجا نمی‌آید چون کارفرما بابتش بدهکار نیست.
 */
export default async function ClientReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const totalDue = data.projects.reduce((sum, p) => sum + Number(p.due), 0);

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header className="grid gap-1">
        <Link
          href="/reports"
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-3.5" />
          {t("بازگشت به گزارش‌ها")}
        </Link>
        <h1 className="text-xl font-semibold">{data.person.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t('مجموعِ مطالبات: {amount}', { amount: format(totalDue.toFixed(2)) })}
        </p>
      </header>

      {data.projects.length === 0 ? (
        <EmptyState title={t("این کارفرما به پروژه‌ای وصل نیست")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("پروژه")}</TableHead>
              <TableHead>{t("قیمت")}</TableHead>
              <TableHead>{t("هزینه‌های قابلِ صورت‌حساب")}</TableHead>
              <TableHead>{t("دریافت‌شده")}</TableHead>
              <TableHead>{t("مانده")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.projects.map((p) => (
              <TableRow key={p.projectId}>
                <TableCell>
                  <Link href={`/projects/${p.projectId}`} className="hover:underline">
                    {p.title}
                  </Link>
                </TableCell>
                <TableNumericCell>{format(p.price)}</TableNumericCell>
                <TableNumericCell>{format(p.expenses)}</TableNumericCell>
                <TableNumericCell>{format(p.paid)}</TableNumericCell>
                <TableNumericCell className="font-semibold">{format(p.due)}</TableNumericCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
