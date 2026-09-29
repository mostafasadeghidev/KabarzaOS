import Link from 'next/link';
import { Clock } from 'lucide-react';
import type { Actor } from '@/domain/access/permissions';
import { canLogGeneral, loggableProjects, timerState } from '@/server/timelogs/service';
import { toDateString } from '@/domain/timelogs/timer';
import { Panel } from '@/components/page-shell';
import { ManualLogForm, StartTimerForm } from '../hours/hours-view';
import { t } from '@/i18n/server';

/**
 * کارتِ «ثبتِ ساعت» روی داشبوردِ عضو — پورتِ `time_logging_section()` که
 * نسخهٔ قبلی زیرِ مناقصه‌ها می‌گذاشت. عضو برای زدنِ تایمر لازم نیست به صفحهٔ
 * ساعت برود.
 *
 * ⚠️ وقتی تایمری روشن یا پارک‌شده است، کارت نیست: نوارِ تایمرِ بالای صفحه
 * (layout) همان را با توقف/تأیید نشان می‌دهد و دو کنترل برای یک تایمر گیج‌کننده بود.
 */
export async function DashboardTimeLog({ actor }: { actor: Actor }) {
  const now = new Date();
  const [projects, state] = await Promise.all([loggableProjects(actor), timerState(actor, now)]);
  const general = canLogGeneral(actor);
  if (!general && projects.length === 0) return null;
  if (state.running || state.pending) return null;

  return (
    <Panel
      icon={<Clock />}
      title={t('ثبتِ ساعت')}
      actions={<Link href="/hours" className="text-sm underline">{t('همهٔ ثبت‌ها')}</Link>}
    >
      <StartTimerForm projects={projects} canLogGeneral={general} />
      <details className="group">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          {t('ثبتِ دستی')}
        </summary>
        <div className="mt-3">
          <ManualLogForm projects={projects} canLogGeneral={general} today={toDateString(now)} />
        </div>
      </details>
    </Panel>
  );
}
