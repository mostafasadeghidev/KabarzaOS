import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import {
  teamComments, teamMembers, teamProjects, teamTasks, teamTaskCount, taskFilterOptions, TEAM_PER_PAGE, teamReviewTasks,
} from '@/server/team/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { RangeKey } from '@/domain/access/office-scope';
import { EmptyState } from '@/components/ui/empty-state';
import { TeamView } from './team-view';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell } from '@/components/page-shell';

/** «تیمِ من» — نمای مدیرِ دفتر. عملیاتی، نه مالی. */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string; tstatus?: string; tassignee?: string;
    tprio?: string; tdue?: string; tpage?: string;
  }>;
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

  const params = await searchParams;

  /**
   * فیلترهای بردِ تسک از آدرس — همان `tstatus`/`tassignee`/`tprio`/`tdue` ِ
   * نسخهٔ قبلی، با پیشوندِ `t` تا با فیلترِ بازهٔ اعضا (`range`) قاطی نشوند.
   */
  const perPage = 50;
  const taskFilter = {
    statusTagId: Number(params.tstatus) || null,
    // ⚠️ `'0'` معتبر است و معنایش «بدونِ مسئول» — پس `Number(...) || null` غلط بود.
    assigneeId: params.tassignee === '' || params.tassignee === undefined
      ? null
      : Number(params.tassignee),
    priorityTagId: Number(params.tprio) || null,
    due: params.tdue || null,
    page: Number(params.tpage) || 1,
    perPage,
  };

  try {
    const [projects, tasks, taskTotal, taskOptions, comments, members, reviewTasks] = await Promise.all([
      teamProjects(actor),
      teamTasks(actor, taskFilter),
      teamTaskCount(actor, taskFilter),
      taskFilterOptions(actor),
      teamComments(actor),
      teamMembers(actor, params),
      teamReviewTasks(actor),
    ]);

    return (
      <PageShell>
        <PageHeader
          title={t("تیمِ من")}
          description={(
            <>{t("پروژه‌ها، تسک‌ها و ساعتِ کاریِ دفاترِ تحتِ مدیریتِ شما.")}</>
          )}
        />

        <TeamView
          data={{
            projects,
            tasks,
            reviewTasks,
            comments,
            taskOptions,
            taskPaging: {
              page: taskFilter.page,
              perPage,
              total: taskTotal,
              totalPages: Math.max(1, Math.ceil(taskTotal / perPage)),
            },
            members: members.members,
            range: (members.period.range ?? 'week') as RangeKey,
          }}
        />
      </PageShell>
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <EmptyState
            title={t("دفترِ تحتِ مدیریتی ندارید")}
            description={t("این بخش برای مدیرانِ دفتر است.")}
          />
        </PageShell>
      );
    }
    throw error;
  }
}
