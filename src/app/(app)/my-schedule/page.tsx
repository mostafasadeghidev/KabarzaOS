import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { getWeek } from '@/server/availability/service';
import { leaveTargets, listAbsences } from '@/server/availability/absence-service';
import { getSystemConfig } from '@/server/settings/system-service';
import { weekdayIndex, weekOrder, type Slot } from '@/domain/availability/weekly';
import { AvailabilityView } from '../activity/availability-view';
import { AbsencePanel } from '../activity/absence-panel';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell } from '@/components/page-shell';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('برنامهٔ من');

/**
 * «برنامهٔ من» — روزها و ساعت‌های کاری و مرخصی‌های **خودِ** کاربر (۲.۲.۰).
 *
 * ⚠️ چرا صفحهٔ جدا: پیش از این برنامهٔ هفتگی هم در «فعالیت ← در دسترس بودن»
 * بود و هم در صفحهٔ تیمیِ «در دسترس بودن»، و مرخصیِ خود زیرِ «فعالیت» —
 * اسمی که به کسی که می‌خواهد روزهای کاری‌اش را ثبت کند نمی‌گوید کجا برود.
 * حالا هر چیز یک جا دارد: کارِ شخصی اینجا، نمای تیم در «حضور و مرخصیِ تیم»،
 * گزارشِ سامانه در «رویدادها».
 *
 * مجوزی لازم نیست: هر کس برنامه و مرخصیِ خودش را می‌گرداند.
 */
export default async function MySchedulePage() {
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [mineMap, system, myAbsences, targets] = await Promise.all([
    getWeek(actor.id),
    getSystemConfig(),
    // پورتِ `for_user(upcoming_only)`: فقط بازه‌های امروز به بعد.
    listAbsences(actor, actor.id, { upcomingOnly: true, today }).catch(() => []),
    leaveTargets(actor),
  ]);

  // Map به شیء تبدیل می‌شود تا از مرزِ سرور/کلاینت رد شود.
  const toRecord = (m: Map<number, Slot[]>) => Object.fromEntries(m) as Record<number, Slot[]>;
  // ⚠️ فقط خودِ کاربر — ثبتِ مرخصی برای دیگران در «حضور و مرخصیِ تیم» است.
  const me = targets.filter((p) => p.id === actor.id);

  return (
    <PageShell>
      <PageHeader
        title={t('برنامهٔ من')}
        description={t('روزها و ساعت‌هایی که کار می‌کنید و مرخصی‌هایتان؛ مدیرِ تیم همین را در نمای تیم می‌بیند.')}
      />

      <AvailabilityView
        data={{
          mine: toRecord(mineMap),
          // ⚠️ ترتیبِ ستون‌ها از تنظیماتِ سامانه — نه ثابتِ «شنبه».
          order: weekOrder(system.weekStart),
          // روزِ امروز از **سرور** — تا نشانِ «امروز» در هیدریشن نپرد.
          today: weekdayIndex(now),
        }}
      />

      <AbsencePanel data={{ mine: myAbsences, targets: me, meId: actor.id, today }} />
    </PageShell>
  );
}
