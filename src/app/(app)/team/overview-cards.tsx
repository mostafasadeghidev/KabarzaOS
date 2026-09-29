import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { StatCard } from '@/components/stat-card';
import { Section } from '@/components/page-shell';
import { t } from '@/i18n/server';

export interface TeamCounts {
  projects: number;
  members: number;
  openTasks: number;
  reviewTasks: number;
  comments: number;
}

/**
 * «تیمِ تحتِ مدیریتِ شما» — پورتِ `team_overview_cards`: پنج رقمِ عملیاتی
 * (نه مالی)، هرکدام پیوند به تبِ خودش در «تیمِ من».
 *
 * `withLink` — روی داشبورد پیوندِ «گزارش و رصدِ تیم» هم می‌آید؛ خودِ صفحهٔ
 * «تیمِ من» آن را لازم ندارد (همان `$with_link` ِ نسخهٔ قبلی).
 */
export function TeamOverviewCards({ counts, withLink = false }: { counts: TeamCounts; withLink?: boolean }) {
  const cards = [
    { label: 'پروژه‌های تحت مدیریت', value: counts.projects, tab: 'projects' },
    { label: 'کارکنان تحت مدیریت', value: counts.members, tab: 'members' },
    { label: 'تسک‌های باز تیم', value: counts.openTasks, tab: 'tasks' },
    { label: 'تسک‌های نیاز به ریویو', value: counts.reviewTasks, tab: 'review' },
    { label: 'کامنت‌های نیازمند بررسی تیم', value: counts.comments, tab: 'comments' },
  ];
  return (
    <Section
      title={withLink ? t('تیمِ تحت مدیریت شما') : undefined}
      actions={withLink && (
        <Link href="/team" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {t('گزارش و رصدِ تیم')}
          <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden />
        </Link>
      )}
    >
      <div className="grid grid-cols-2 gap-4 @xl/main:grid-cols-3 @5xl/main:grid-cols-5">
        {cards.map((c) => (
          <StatCard key={c.tab} label={t(c.label)} value={c.value} href={`/team?tab=${c.tab}`} />
        ))}
      </div>
    </Section>
  );
}
