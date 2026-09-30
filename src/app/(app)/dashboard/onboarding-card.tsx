import { Progress } from '@/components/ui/progress';
import { Panel } from '@/components/page-shell';
import { dayNumber } from '@/domain/onboarding/plan';
import { t } from '@/i18n/server';
import { TaskRows, type TaskItem } from '../onboarding/onboarding-client';

export interface OnboardingCardData {
  today: string;
  start: string | null;
  own: TaskItem[];
  progress: { total: number; done: number; overdue: number; percent: number };
  forOthers: TaskItem[];
}

/**
 * کارتِ «آنبوردینگِ شما» روی داشبوردِ عضو — کارهای روزهای اول، روز‌به‌روز.
 * کارِ دیگران (ایمیلِ کاری، دسترسیِ گیت) برای عضو فقط «در انتظار» است؛ تیکش
 * با خودِ مسئول است. زیرش، اگر هست: کارهای آنبوردینگِ **دیگران** که با اوست.
 */
export function OnboardingCard({ data, memberId }: { data: OnboardingCardData; memberId: number }) {
  const days = new Map<number, TaskItem[]>();
  for (const task of data.own) {
    const n = data.start ? dayNumber(data.start, task.dueDate) : 1;
    days.set(n, [...(days.get(n) ?? []), task]);
  }
  const todayNumber = data.start ? dayNumber(data.start, data.today) : 1;
  const allDone = data.progress.total > 0 && data.progress.done === data.progress.total;

  return (
    <>
      {data.own.length > 0 && (
        <Panel
          title={allDone ? t('آنبوردینگِ شما کامل شد') : t('خوش آمدید! آنبوردینگِ شما')}
          description={t('کارهایی که مالِ دیگران است خودشان تیک می‌زنند.')}
          actions={(
            <div className="flex w-56 flex-col items-end gap-1">
              <span className="text-sm">{t('{done} از {total} انجام شده', { done: data.progress.done, total: data.progress.total })}</span>
              <Progress value={data.progress.percent} className="h-2" />
            </div>
          )}
        >
          <div className="grid gap-4">
            {[...days.entries()].sort(([a], [b]) => a - b).map(([n, tasks]) => (
              <div key={n} className="grid gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t('روزِ {n}', { n })}
                  {n === todayNumber && ` · ${t('امروز')}`}
                </h3>
                <TaskRows tasks={tasks} memberId={memberId} />
              </div>
            ))}
          </div>
        </Panel>
      )}

      {data.forOthers.length > 0 && (
        <Panel title={t('کارهای آنبوردینگِ دیگران که با شماست')}>
          <TaskRows tasks={data.forOthers} showPerson />
        </Panel>
      )}
    </>
  );
}
