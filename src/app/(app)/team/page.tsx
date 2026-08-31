import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import {
  teamComments, teamMembers, teamProjects, teamTasks, teamTaskCount,
  taskFilterOptions, TEAM_PER_PAGE,
} from '@/server/team/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { RangeKey } from '@/domain/access/office-scope';
import { EmptyState } from '@/components/ui/empty-state';
import { TeamView } from './team-view';
import { t } from '@/i18n/server';

/** «تیمِ من» — نمای مدیرِ دفتر. عملیاتی، نه مالی. */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string; tstatus?: string; tassignee?: string;
    tprio?: string; tdue?: string; tpage?: string;
  }>;
}) {
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
    const [projects, tasks, taskTotal, taskOptions, comments, members] = await Promise.all([
      teamProjects(actor),
      teamTasks(actor, taskFilter),
      teamTaskCount(actor, taskFilter),
      taskFilterOptions(actor),
      teamComments(actor),
      teamMembers(actor, params),
    ]);

    return (
      <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
        <header>
          <h1 className="text-xl font-semibold">{t("تیمِ من")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("پروژه‌ها، تسک‌ها و ساعتِ کاریِ دفاترِ تحتِ مدیریتِ شما.")}
          </p>
        </header>

        <TeamView
          data={{
            projects,
            tasks,
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
      </main>
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <main className="p-6">
          <EmptyState
            title={t("دفترِ تحتِ مدیریتی ندارید")}
            description={t("این بخش برای مدیرانِ دفتر است.")}
          />
        </main>
      );
    }
    throw error;
  }
}
