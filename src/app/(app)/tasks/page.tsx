import { redirect } from 'next/navigation';
import Link from 'next/link';
import { currentActor } from '@/server/auth';
import { myTasks } from '@/server/projects/service';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { primeTranslations, t } from '@/i18n/server';

/**
 * «تسک‌های شما» — پورتِ `view_tasks()` ِ داشبوردِ نسخهٔ قبلی.
 *
 * ⚠️ دو بخشِ جدا، نه یک فهرست: کاری که الان روی میزِ توست، و کاری که تمام
 * کرده‌ای و منتظرِ بررسیِ دیگری است. قاطی‌کردنشان یعنی فهرستِ امروزت با
 * چیزهایی پر می‌شود که کاری با آن‌ها نداری.
 *
 * ⚠️ گاردِ خاصی ندارد چون دادهٔ **خودِ کاربر** است — کوئری فقط تسک‌هایی را
 * می‌آورد که به او سپرده شده (و دامنهٔ خصوصی هم در همان‌جا فیلتر می‌شود).
 */
function TaskList({
  rows,
  empty,
}: {
  rows: Awaited<ReturnType<typeof myTasks>>['active'];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="px-4 pb-4 text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="grid gap-1 px-4 pb-4">
      {rows.map((t) => (
        <li key={t.id}>
          <Link
            href={`/projects/${t.projectId}`}
            className="flex flex-wrap items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/50"
          >
            <span className="min-w-0 flex-1 truncate">{t.title}</span>

            {t.priorityName && (
              <Badge
                variant="outline"
                style={t.priorityColor ? { borderColor: t.priorityColor } : undefined}
              >
                {t.priorityName}
              </Badge>
            )}

            {t.statusName && (
              <Badge variant="secondary">{t.statusName}</Badge>
            )}

            {/* ⚠️ نامِ پروژه لازم است — تسک بدونِ آن بی‌زمینه است. */}
            <span className="shrink-0 text-xs text-muted-foreground">{t.projectTitle}</span>

            {t.dueDate && <span className="num shrink-0 text-xs text-muted-foreground">{t.dueDate}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function MyTasksPage() {
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

  const { active, waiting } = await myTasks(actor);

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("تسک‌های شما")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('{n} تسکِ جاری', { n: active.length })}
          {waiting.length > 0
            && <> · {t('{n} در انتظارِ بررسی', { n: waiting.length })}</>}
        </p>
      </header>

      {active.length === 0 && waiting.length === 0 ? (
        <EmptyState
          title={t("تسکی به شما سپرده نشده")}
          description={t("تسک‌هایی که به شما یا نقشتان سپرده شوند اینجا می‌آیند.")}
        />
      ) : (
        <div className="grid gap-4 @3xl/main:grid-cols-2">
          <Card className="gap-2 py-4">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm">{t("تسک‌های جاری شما")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <TaskList rows={active} empty={t("تسکِ جاری ندارید.")} />
            </CardContent>
          </Card>

          <Card className="gap-2 py-4">
            <CardHeader className="px-4 pb-0">
              <CardTitle className="text-sm">{t("در انتظارِ بررسی")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <TaskList rows={waiting} empty={t("موردی در انتظارِ بررسی نیست.")} />
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
