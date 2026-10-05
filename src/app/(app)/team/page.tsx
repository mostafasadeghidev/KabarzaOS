import { redirect } from 'next/navigation';
import { UserAvatar } from '@/components/user-avatar';
import { currentActor } from '@/server/auth';
import {
  taskFilterOptions, teamComments, teamMembers, teamOverview, teamProjects, teamReviewTasks, teamTasks,
} from '@/server/team/service';
import { canCreateProjects, getProjectFormOptions } from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { RangeKey } from '@/domain/access/office-scope';
import { parseAssignee, TEAM_TABS, type TeamTab } from '@/domain/team/boards';
import { EmptyState } from '@/components/ui/empty-state';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell } from '@/components/page-shell';
import { TeamOverviewCards } from './overview-cards';
import { TeamTabs } from './team-tabs';
import { MembersPanel } from './members-panel';
import { ProjectBoard } from './project-board';
import { TaskBoard } from './task-board';
import { CommentThreads, ReviewTasks } from './review-panel';
import { ProjectDialog } from '../projects/_form/project-dialog';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('تیمِ من');

type Params = {
  tab?: string; range?: string; from?: string; to?: string;
  tstatus?: string; tassignee?: string; tprio?: string; tdue?: string; tpage?: string; tper?: string; tall?: string;
};

/**
 * «تیمِ من» — نمای مدیرِ دفتر: کارت‌های تیم بالا، و پنج تبِ همان صفحه‌های
 * نسخهٔ قبلی (`view_office_report` و `view_team_*`). عملیاتی، نه مالی.
 *
 * ⚠️ تب در **آدرس** است (`?tab=`)، نه state: کارت‌های داشبورد و پروفایلِ عضو
 * مستقیم به یک تب پیوند می‌دهند («تسک باز» → `?tab=tasks&tassignee=u:7`)، و
 * با state صفحه همیشه روی «اعضا» باز می‌شد. هر تب فقط دادهٔ خودش را می‌خواند.
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<Params> }) {
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
  const tab: TeamTab = (TEAM_TABS as readonly string[]).includes(params.tab ?? '')
    ? params.tab as TeamTab
    : 'members';

  try {
    const counts = await teamOverview(actor);

    let body: React.ReactNode;
    if (tab === 'projects') {
      const [projects, mayCreate] = await Promise.all([teamProjects(actor), canCreateProjects(actor)]);
      const form = mayCreate ? await getProjectFormOptions(actor) : null;
      body = (
        <ProjectBoard
          mode="manage"
          projects={projects}
          empty={t('هنوز پروژه‌ای در دفاتر شما نیست.')}
          action={form && (
            <ProjectDialog
              options={{
                statuses: form.statuses.map((s) => ({ id: s.id, label: s.name })),
                currencies: form.currencies.map((c) => ({ id: c.id, label: c.code })),
                offices: form.offices.map((o) => ({ id: o.id, label: o.name })),
                parents: form.parents.map((p) => ({ id: p.id, label: p.title })),
                defaultCurrencyId: form.currencies.find((c) => c.isDefault)?.id ?? null,
                roleTags: form.roleTags,
                canUsePrivate: form.canUsePrivate,
                officeRequired: form.officeRequired,
                canEditMoney: form.canSetMoney,
                today: new Date().toISOString().slice(0, 10),
                bootstrap: {
                  people: form.people.map((p) => ({ value: p.id, label: p.name, media: <UserAvatar userId={p.id} name={p.name} size="xs" /> })),
                  clients: form.clientPeople.map((c) => ({ value: c.id, label: c.name, media: <UserAvatar userId={c.id} name={c.name} size="xs" /> })),
                  memberRoles: form.memberRoles,
                  roleTags: form.roleTags,
                  priorities: form.priorities.map((p) => ({ id: p.id, label: p.name })),
                  currencies: form.currencies.map((c) => ({ id: c.id, label: c.code })),
                  defaultCurrencyId: form.currencies.find((c) => c.isDefault)?.id ?? null,
                  hasQaLibrary: form.hasQaLibrary,
                  qaItems: form.qaItems,
                },
              }}
            />
          )}
        />
      );
    } else if (tab === 'tasks') {
      const filter = {
        statusTagId: Number(params.tstatus) || null,
        assignee: parseAssignee(params.tassignee),
        priorityTagId: Number(params.tprio) || null,
        due: params.tdue || null,
        openOnly: params.tall !== '1',
        page: Number(params.tpage) || 1,
        perPage: Number(params.tper) || undefined,
      };
      const [board, options] = await Promise.all([teamTasks(actor, filter), taskFilterOptions(actor)]);
      body = <TaskBoard board={board} options={options} />;
    } else if (tab === 'review') {
      body = <ReviewTasks tasks={await teamReviewTasks(actor)} />;
    } else if (tab === 'comments') {
      body = <CommentThreads threads={await teamComments(actor)} />;
    } else {
      const data = await teamMembers(actor, params);
      body = (
        <MembersPanel
          data={{
            members: data.members,
            hours: data.hours,
            matrix: data.matrix,
            dayLabels: data.dayLabels,
            range: (data.period.range ?? 'week') as RangeKey,
            from: data.period.from ?? '',
            to: data.period.to ?? '',
          }}
        />
      );
    }

    return (
      <PageShell>
        <PageHeader
          title={t("تیمِ من")}
          description={t("پروژه‌ها، تسک‌ها و ساعتِ کاریِ دفاترِ تحتِ مدیریتِ شما.")}
        />
        <TeamOverviewCards counts={counts} />
        <TeamTabs tab={tab} />
        {body}
      </PageShell>
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader title={t("تیمِ من")} />
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
