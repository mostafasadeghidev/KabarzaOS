import { redirect } from 'next/navigation';
import { currentActor, currentSession } from '@/server/auth';
import { getDashboard } from '@/server/dashboard';
import { ForbiddenError } from '@/domain/access/guard';
import { getMemberDashboard } from '@/server/dashboard-member';
import { EmptyState } from '@/components/ui/empty-state';
import { activeLocale, primeTranslations, t } from '@/i18n/server';
import { intlTag } from '@/i18n/config';
import { PageHeader, PageShell } from '@/components/page-shell';
import { DEMO_ALLOWED, demoAdminExtras, demoClientExtras, demoComments, demoDash, demoInbox, demoMemberDash, demoMemberExtras, demoMemberTasks } from '@/server/dashboard-demo';
import Link from 'next/link';
import { canViewSection } from '@/domain/access/permissions';
import { hasTeamScope, teamOverview } from '@/server/team/service';
import { TeamOverviewCards } from '../team/overview-cards';
import { DashboardTimeLog } from './time-log-card';
import { pageTitle } from '@/i18n/page-title';
import { DashboardV2 } from './dashboard-v2';
import { getDashboardInbox } from '@/server/dashboard-inbox';
import { taskStatusTags } from '@/server/projects/repository';
import { myOpenCommentThreads, myTasks } from '@/server/projects/service';
import { MemberDashboardV2 } from './member-dashboard-v2';
import { ClientDashboardV2, adminExtraWidgets, memberExtraWidgets } from './extra-widgets';
import { LiveRefresh } from './extras-client';
import { DashPrefsProvider } from './dash-prefs';
import { getDashPrefs } from '@/server/dashboard-prefs';
import { timerState } from '@/server/timelogs/service';
import { getAdminExtras, getClientExtras, getMemberExtras } from '@/server/dashboard-extras';

export const generateMetadata = pageTitle('نمای کلی');

/**
 * داشبورد — سه نمای مدیر / عضو / کارفرما (۳.۱۸.۰)، هر سه شبکهٔ کارتِ قابلِ چیدن.
 * ⚠️ «نمای قبلی» (`?classic=1`) و داشبوردِ کهنهٔ مدیر در ۳.۱۸.۱ به خواستِ مالک برداشته شد.
 */

/**
 * ⚠️ تقویم از **زبانِ کاربر** می‌آید، نه `fa-IR` ِ هاردکد. کاربرِ انگلیسی
 * پیش‌تر «شنبه ۷ شهریور ۱۴۰۵» می‌دید — با ارقامِ فارسی — که نه فقط ترجمه‌نشده
 * که ناخواناست (R-I18N-12).
 */
function todayLabel(): string {
  return new Intl.DateTimeFormat(intlTag(activeLocale()), {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    // ⚠️ ارقامِ لاتین — همان قراردادِ `.num` در بقیهٔ اپ؛ دو نظامِ رقم در یک صفحه نه.
    numberingSystem: 'latn',
  }).format(new Date());
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ office?: string; demo?: string }>;
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

  // فیلترِ دفتر روی نمودارهای ساعت (پورتِ `kt_office`) — نامعتبر = همه.
  const { office, demo: demoParam } = await searchParams;
  // دادهٔ نمایشی فقط در حالتِ توسعه (dashboard-demo.ts) — برای دیدنِ کارت‌ها با دادهٔ زیاد.
  const demo = demoParam === '1' && DEMO_ALLOWED;
  const officeParam = Number(office);

  let data;
  try {
    data = await getDashboard(actor, { officeId: Number.isInteger(officeParam) && officeParam > 0 ? officeParam : null });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      /**
       * ⚠️ عضو و کارفرما «دسترسی ندارند» نیست — داشبوردِ **خودشان** را
       * دارند. در نسخهٔ قبلی این دو نقش اصلاً وارد پنلِ ادمین نمی‌شوند و
       * `member_overview()` / `client_overview()` را می‌بینند. اینجا تنها
       * چیزی که نداشتند مجوزِ سراسری بود، نه کار.
       */
      const isClient = actor.roles.includes('client');
      const isMember = actor.roles.includes('member');
      if (isClient || isMember) {
        // پورتِ داشبوردِ نسخهٔ قبلی: عضو **و** کارفرما هر دو بخش را می‌بینند اگر هر دو نقش را دارند.
        const [rawOwn, session, managesTeam] = await Promise.all([
          getMemberDashboard(actor),
          currentSession(),
          hasTeamScope(actor),
        ]);
        /**
         * کارت‌های «تیمِ تحتِ مدیریتِ شما» — پورتِ `team_overview_cards`. ⚠️ فقط
         * روی داشبوردِ عضو (`member_overview`)، همان‌جا که نسخهٔ قبلی می‌گذاشت.
         */
        const own = demo ? demoMemberDash(rawOwn) : rawOwn;
        // پیوندِ «دادهٔ نمایشی / واقعی» (فقط محلی).
        const headerLinks = DEMO_ALLOWED
          ? <Link href={demo ? '/dashboard' : '/dashboard?demo=1'} className="text-xs text-muted-foreground hover:underline">{demo ? t('دادهٔ واقعی') : t('دادهٔ نمایشی')}</Link>
          : null;
        const teamCards = managesTeam
          ? <TeamOverviewCards counts={await teamOverview(actor)} withLink />
          : null;
        /*
         * داشبوردِ عضو — همان شبکهٔ قابلِ ویرایش، با کارت‌هایی از دسترسیِ خودش.
         * ⚠️ «نمای قبلی» (`?classic=1`) در ۳.۱۸.۱ برداشته شد؛ فقط همین داشبورد هست.
         */
        if (isMember) {
          const [mine, rawThreads, rawMx, timer, prefs] = await Promise.all([
            myTasks(actor), myOpenCommentThreads(actor), getMemberExtras(actor), timerState(actor), getDashPrefs(actor.id),
          ]);
          // ⚠️ با تایمرِ روشن (یا در انتظار) کارتِ «ثبتِ ساعت» چیزی ندارد؛ ساخته نشود تا جای خالی نماند.
          const showLog = !(timer.running || timer.pending);
          const rawTasks = mine.kind === 'member' ? { active: mine.active, waiting: mine.waiting, review: mine.review } : null;
          const tasks = demo && rawTasks ? demoMemberTasks(rawTasks) : rawTasks;
          const threads = demo ? demoComments(rawThreads) : rawThreads;
          const mx = demo ? demoMemberExtras(rawMx) : rawMx;
          return (
            <PageShell>
              <PageHeader
                title={t('سلام، {name}', { name: session?.name ?? '' })}
                description={todayLabel()}
                actions={headerLinks}
              />
              <DashPrefsProvider initial={prefs} readOnly={!!actor.viewOnly}>
              <MemberDashboardV2
                data={own}
                tasks={tasks}
                comments={threads}
                userId={actor.id}
                teamCards={teamCards}
                timeLog={showLog ? <DashboardTimeLog actor={actor} part="log" /> : null}
                myWeek={<DashboardTimeLog actor={actor} part="week" />}
                extra={memberExtraWidgets(mx, actor.id)}
              />
              </DashPrefsProvider>
              <LiveRefresh />
            </PageShell>
          );
        }
        /*
         * داشبوردِ **کارفرما** — همان شبکهٔ قابلِ ویرایش، با کارت‌های کارفرما.
         */
        const [mine, rawCx, prefs] = await Promise.all([myTasks(actor), getClientExtras(actor), getDashPrefs(actor.id)]);
        const cx = demo ? demoClientExtras(rawCx) : rawCx;
        const rawReview = mine.kind === 'client' ? mine.review : [];
        const rawAssigned = mine.kind === 'client' ? mine.active : [];
        const demoed = demo ? demoMemberTasks({ active: rawAssigned, waiting: [], review: rawReview }) : null;
        const review = demoed ? demoed.review : rawReview;
        // کارهای سپرده به خودِ کارفرما (نمایشی: بی ردیف‌های «قابلِ برداشتن» که مالِ عضو است).
        const assigned = demoed ? demoed.active.filter((tk) => !('claimable' in tk && tk.claimable)) : rawAssigned;
        return (
          <PageShell>
            <PageHeader
              title={t('سلام، {name}', { name: session?.name ?? '' })}
              description={todayLabel()}
              actions={headerLinks}
            />
            <DashPrefsProvider initial={prefs} readOnly={!!actor.viewOnly}>
              <ClientDashboardV2 data={own} extras={cx} review={review} assigned={assigned} userId={actor.id} />
            </DashPrefsProvider>
            <LiveRefresh />
          </PageShell>
        );
      }
      return (
        <PageShell>
          <PageHeader title={t("داشبورد")} />
          <EmptyState title={t("دسترسی ندارید")} description={t("برای دیدنِ داشبورد از مدیر دسترسی بگیرید.")} />
        </PageShell>
      );
    }
    throw error;
  }

  /*
   * داشبوردِ مدیر («اول کار، بعد عدد»).
   */
  const [rawInbox, statuses, session, rawAx] = await Promise.all([getDashboardInbox(actor), taskStatusTags(), currentSession(), getAdminExtras(actor)]);
  const inbox = demo ? demoInbox(rawInbox) : rawInbox;
  const ax = demo ? demoAdminExtras(rawAx) : rawAx;
  if (demo) data = demoDash(data);
  const review = statuses.find((s) => s.isReview);
  const approve = statuses.find((s) => s.group === 'complete' && !s.isClosed) ?? statuses.find((s) => s.group === 'complete');
  const back = statuses.find((s) => s.group === 'in_progress' && !s.isReview && review && statuses.indexOf(s) > statuses.indexOf(review))
    ?? statuses.find((s) => s.group === 'in_progress' && !s.isReview);
  return (
    <PageShell>
      <PageHeader
        title={t('سلام، {name}', { name: session?.name ?? '' })}
        description={todayLabel()}
        actions={<>
          {DEMO_ALLOWED && <Link href={demo ? '/dashboard' : '/dashboard?demo=1'} className="text-xs text-muted-foreground hover:underline">{demo ? t('دادهٔ واقعی') : t('دادهٔ نمایشی')}</Link>}
        </>}
      />
      <DashPrefsProvider initial={await getDashPrefs(actor.id)} readOnly={!!actor.viewOnly}>
      <DashboardV2
        data={data}
        inbox={inbox}
        approveStatusId={approve?.id ?? null}
        returnStatusId={back?.id ?? null}
        canReports={canViewSection(actor, 'reports')}
        userId={actor.id}
        extra={adminExtraWidgets(ax)}
      />
      </DashPrefsProvider>
      <LiveRefresh />
    </PageShell>
  );
}
