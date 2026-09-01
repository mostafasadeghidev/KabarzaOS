import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { getMemberDetail } from '@/server/reports/service';
import { ForbiddenError } from '@/domain/access/guard';
import { format } from '@/domain/money/money';
import { hoursLabel } from '@/domain/reports/summary';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { primeTranslations, t } from '@/i18n/server';

const STATUS_LABEL: Record<string, string> = {
  paid: 'تسویه',
  partial: 'بخشی',
  unpaid: 'پرداخت‌نشده',
};

/**
 * ریزِ کارِ یک عضو — پورتِ `member_detail()` ِ گزارش‌ها.
 *
 * ⚠️ مبالغ در ارزِ **خودِ پروژه** نشان داده می‌شوند، نه یک ارزِ واحد: عضوی
 * که با یک پروژه به یورو و با دیگری به تومان توافق کرده، دیدنِ رقمِ تبدیل‌شده
 * برایش گمراه‌کننده است.
 */
export default async function MemberReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const linesOf = (projectId: number) => data.lines.filter((l) => l.projectId === projectId);

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
        <p className="num text-sm text-muted-foreground">{data.person.email}</p>
      </header>

      {data.projects.length === 0 ? (
        <EmptyState title={t("این عضو روی هیچ پروژه‌ای نیست")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("پروژه")}</TableHead>
              <TableHead>{t("ارز")}</TableHead>
              <TableHead>{t("توافق‌شده")}</TableHead>
              <TableHead>{t("پرداخت‌شده")}</TableHead>
              <TableHead>{t("مانده")}</TableHead>
              <TableHead>{t("وضعیت")}</TableHead>
              <TableHead>{t("ساعت کاری")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.projects.map((p) => (
              <TableRow key={p.projectId}>
                <TableCell>
                  <Link href={`/projects/${p.projectId}`} className="hover:underline">
                    {p.title}
                  </Link>
                  {/*
                    ردیف‌های پرداخت زیرِ همان پروژه — بدونِ آن‌ها «۱۲۰۰ پرداخت
                    شد» جوابِ «کِی و بابتِ چه؟» را نمی‌دهد.
                  */}
                  {linesOf(p.projectId).length > 0 && (
                    <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                      {linesOf(p.projectId).map((l, i) => (
                        <li key={i} className="flex flex-wrap gap-2">
                          <span className="num">
                            {format(l.amountSettled ?? l.amount)}
                          </span>
                          {l.paidAt && (
                            <span className="num">
                              {l.paidAt.toISOString().slice(0, 10)}
                            </span>
                          )}
                          {l.note && <span>{l.note}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell className="num">{p.currencyCode ?? '—'}</TableCell>
                <TableNumericCell>{format(p.agreed)}</TableNumericCell>
                <TableNumericCell>{format(p.paid)}</TableNumericCell>
                <TableNumericCell className="font-semibold">{format(p.remaining)}</TableNumericCell>
                <TableCell>
                  <Badge variant={p.status === 'paid' ? 'secondary' : 'outline'}>
                    {t(STATUS_LABEL[p.status] ?? p.status)}
                  </Badge>
                </TableCell>
                <TableNumericCell>{hoursLabel(p.minutes)}</TableNumericCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
