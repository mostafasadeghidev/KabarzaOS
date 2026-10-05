import Link from 'next/link';
import { UserAvatar } from '@/components/user-avatar';
import { notFound, redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { OnboardingError, onboardingDetail } from '@/server/onboarding/service';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/stat-card';
import { PageHeader, PageShell, Panel } from '@/components/page-shell';
import { primeTranslations, t } from '@/i18n/server';
import { AddTaskDialog, StartButton, TaskRows } from '../onboarding-client';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('آنبوردینگ');

/** آنبوردینگِ یک نفر — نمای مدیر: پیشرفت، عقب‌افتاده‌ها، و همهٔ کارها با مسئول. */
export default async function OnboardingPersonPage({ params }: { params: Promise<{ id: string }> }) {
  await primeTranslations();
  const actor = await currentActor();
  if (!actor) redirect('/login');

  const userId = Number((await params).id);
  if (!Number.isInteger(userId) || userId <= 0) notFound();

  let data;
  try {
    data = await onboardingDetail(actor, userId);
  } catch (error) {
    if (error instanceof OnboardingError) notFound();
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader title={t('آنبوردینگ')} />
          <EmptyState title={t('دسترسی ندارید')} description={t('آنبوردینگ برای کسی باز است که اعضا را می‌بیند.')} />
        </PageShell>
      );
    }
    throw error;
  }

  const started = data.tasks.length > 0;
  const editable = data.enabled && data.canManage && data.person.state === 'active';

  return (
    <PageShell>
      <PageHeader
        back={{ href: '/onboarding', label: t('آنبوردینگ') }}
        media={<UserAvatar userId={userId} name={data.person.name} size="lg" />}
        title={data.person.name}
        description={data.person.roles.length > 0 ? data.person.roles.join(t('، ')) : undefined}
        actions={editable && (
          <div className="flex flex-wrap gap-2">
            <StartButton userId={userId} started={started} />
            {started && (
              <AddTaskDialog userId={userId} people={data.people} services={data.services} today={data.today} />
            )}
          </div>
        )}
      />

      {!data.enabled && (
        <p className="text-sm text-muted-foreground">{t('آنبوردینگ خاموش است؛ این صفحه فقط‌خواندنی است.')}</p>
      )}

      {!started ? (
        <EmptyState
          title={t('هنوز آنبوردینگی ندارد')}
          description={t('با «شروعِ آنبوردینگ» چک‌لیست از کتابخانهٔ نقش‌های او ساخته می‌شود.')}
        />
      ) : (
        <>
          <div className="grid gap-4 @2xl/main:grid-cols-3">
            <div className="grid gap-2 rounded-xl border bg-card p-4">
              <span className="text-sm text-muted-foreground">{t('پیشرفت')}</span>
              <span className="num text-2xl font-semibold">{data.progress.percent}%</span>
              <Progress value={data.progress.percent} className="h-2" />
            </div>
            <StatCard label={t('عقب‌افتاده')} value={data.progress.overdue} tone={data.progress.overdue > 0 ? 'warning' : 'default'} />
            <StatCard label={t('دسترسی‌های ثبت‌شده')} value={data.grants} href={`/access?user=${userId}`} />
          </div>

          <Panel title={t('کارها')} description={t('{done} از {total} انجام شده', { done: data.progress.done, total: data.progress.total })}>
            <TaskRows tasks={data.tasks} canDelete={editable} memberId={userId} />
          </Panel>

          {!editable && data.canManage && data.person.state !== 'active' && (
            <p className="text-xs text-muted-foreground">
              {t('این عضو دیگر فعال نیست؛ چک‌لیستش فقط برای سابقه مانده.')}{' '}
              <Link href={`/access?user=${userId}`} className="underline">{t('دسترسی‌هایش را در سیاهه ببینید')}</Link>
            </p>
          )}
        </>
      )}
    </PageShell>
  );
}
