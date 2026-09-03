import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { currentActor } from '@/server/auth';
import { myTasks, taskableProjects, type InboxTask } from '@/server/projects/service';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { primeTranslations, t } from '@/i18n/server';
import { ClaimTaskButton } from './inbox-claim';
import { TasksTabs } from './tasks-tabs';
import { chipStyle } from '@/domain/ui/contrast';

/**
 * «تسک‌های شما» — پورتِ `view_tasks()` ِ داشبوردِ نسخهٔ قبلی.
 *
 * عضو: «جاری» و «در انتظارِ بررسی» — با قاعدهٔ دیدِ افزونه (تسکِ نقشیِ
 * ادعانشده هم می‌آید تا بشود برداشتش). کارفرما: تسک‌هایی که منتظرِ بررسیِ
 * اویند روی پروژه‌هایش.
 *
 * ⚠️ گاردِ خاصی ندارد چون دادهٔ **خودِ کاربر** است — کوئری فقط دیدنی‌های او
 * را می‌آورد (و دامنهٔ خصوصی هم در همان‌جا فیلتر می‌شود).
 */
function TaskList({ rows, empty }: { rows: InboxTask[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="px-4 pb-4 text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="grid gap-1 px-4 pb-4">
      {rows.map((task) => (
        <li key={task.id} className="flex flex-wrap items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/50">
          {/* پورتِ چیپِ 🔒 «خصوصی». */}
          {task.isPrivate && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('خصوصی')} />}
          <Link
            // پورتِ «باز کردن در پروژه» — با تبِ تسک‌ها و زیرتبِ درست.
            href={`/projects/${task.projectId}?tab=tasks&view=${task.isReview ? 'review' : 'cur'}`}
            className="min-w-0 flex-1 truncate hover:underline"
          >
            {task.title}
          </Link>

          {task.priorityName && (
            <Badge variant="outline" style={chipStyle(task.priorityColor)}>
              {task.priorityName}
            </Badge>
          )}
          {task.statusName && (
            <Badge variant="secondary" style={chipStyle(task.statusColor)}>
              {task.statusName}
            </Badge>
          )}

          {/* پورتِ اقلامِ مسئول: 🏷 نقش (ادعاکننده). */}
          {task.roles.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {task.roles.map((r) => (r.claimedByName ? `${r.roleName ?? ''} (${r.claimedByName})` : (r.roleName ?? ''))).join(t('، '))}
            </span>
          )}

          {/* ⚠️ نامِ پروژه لازم است — تسک بدونِ آن بی‌زمینه است. */}
          <span className="shrink-0 text-xs text-muted-foreground">{task.projectTitle}</span>
          {task.dueDate && <span className="num shrink-0 text-xs text-muted-foreground">{task.dueDate}</span>}

          {task.claimable && <ClaimTaskButton taskId={task.id} projectId={task.projectId} />}
        </li>
      ))}
    </ul>
  );
}

export default async function MyTasksPage() {
  /**
   * ⚠️ هر صفحه **خودش** ترجمه را آماده می‌کند و به چیدمان تکیه نمی‌کند:
   * در ناوبریِ سمتِ کلاینت، Next فقط بخشِ صفحه را دوباره رندر می‌کند و
   * چیدمان را از درختِ کش‌شده برمی‌دارد.
   */
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const inbox = await myTasks(actor);

  if (inbox.kind === 'client') {
    return (
      <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
        <header>
          <h1 className="text-xl font-semibold">{t("تسک‌های نیازمند بررسی شما")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('{n} تسک در انتظارِ بررسیِ شما', { n: inbox.review.length })}</p>
        </header>
        {inbox.review.length === 0 ? (
          <EmptyState title={t("تسکی منتظرِ بررسیِ شما نیست")} description={t("وقتی تیم کاری را برای بررسی بفرستد، اینجا می‌آید.")} />
        ) : (
          <Card className="gap-2 py-4">
            <CardHeader className="px-4 pb-0"><CardTitle className="text-sm">{t("در انتظارِ بررسی")}</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0"><TaskList rows={inbox.review} empty="" /></CardContent>
          </Card>
        )}
      </main>
    );
  }

  const { active, waiting } = inbox;
  // پروژه‌هایی که همین کاربر می‌تواند رویشان تسک بزند — تبِ «افزودنِ سریع».
  const projects = await taskableProjects(actor);

  const inboxPanel = (
    <>
      {active.length === 0 && waiting.length === 0 ? (
        <EmptyState
          title={t("تسکی به شما سپرده نشده")}
          description={t("تسک‌هایی که به شما یا نقشتان سپرده شوند اینجا می‌آیند.")}
        />
      ) : (
        <div className="grid gap-4 @3xl/main:grid-cols-2">
          <Card className="gap-2 py-4">
            <CardHeader className="px-4 pb-0"><CardTitle className="text-sm">{t("تسک‌های جاری شما")}</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0"><TaskList rows={active} empty={t("تسکِ جاری ندارید.")} /></CardContent>
          </Card>
          <Card className="gap-2 py-4">
            <CardHeader className="px-4 pb-0"><CardTitle className="text-sm">{t("در انتظارِ بررسی")}</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0"><TaskList rows={waiting} empty={t("موردی در انتظارِ بررسی نیست.")} /></CardContent>
          </Card>
        </div>
      )}
    </>
  );

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("تسک‌ها")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('{n} تسکِ جاری', { n: active.length })}
          {waiting.length > 0 && <> · {t('{n} در انتظارِ بررسی', { n: waiting.length })}</>}
        </p>
      </header>

      <TasksTabs
        inbox={inboxPanel}
        inboxCount={active.length + waiting.length}
        projects={projects}
        today={new Date().toISOString().slice(0, 10)}
      />
    </main>
  );
}
