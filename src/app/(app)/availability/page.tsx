import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import {
  filterOptions, hasTeamAvailability, onlineNow, rowCells, runningTimers, teamMatrix,
} from '@/server/availability/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { weekdayIndex, weekOrder } from '@/domain/availability/weekly';
import { formatElapsed } from '@/domain/availability/team';
import { EmptyState } from '@/components/ui/empty-state';
import { AvailabilityBoard } from './availability-board';
import { primeTranslations, t } from '@/i18n/server';

/**
 * «در دسترس بودن اعضا» — پورتِ صفحهٔ مستقلِ `Admin\Availability_Page`.
 *
 * ⚠️ چرا صفحهٔ **جدا** و نه یک تب: در نسخهٔ قبلی هم آیتمِ مستقلِ منو است.
 * تبِ داخلِ «فعالیت» نه لینک‌شدنی بود، نه در جستجوی فرمان می‌آمد، و پشتِ
 * مجوزی قفل بود که مخاطبِ اصلی‌اش — مدیرِ دفتر — اصلاً ندارد.
 *
 * ⚠️ گارد اینجا `hasTeamAvailability` است، نه `members.view`: مدیرِ دفتر
 * مجوزِ بخش ندارد ولی باید تیمِ خودش را ببیند. دامنهٔ افراد را خودِ سرویس
 * محدود می‌کند.
 */
export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');
  if (!(await hasTeamAvailability(actor))) redirect('/');

  const view = (await searchParams).view === 'board' ? 'board' : 'matrix';
  const now = new Date();

  const [rows, timers, online, options, system] = await Promise.all([
    teamMatrix(actor, now),
    runningTimers(actor, now),
    onlineNow(actor),
    filterOptions(actor),
    getSystemConfig(),
  ]);

  const order = weekOrder(system.weekStart);
  const todayIdx = weekdayIndex(now);

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("در دسترس بودن اعضا")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("هر عضو روزها و ساعت‌هایی که در هفته در دسترسِ کار است را خودش ثبت می‌کند؛ این صفحه نمای هفتگیِ کلِ تیم است.")}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState title={t("عضوی ثبت نشده.")} />
      ) : (
        <AvailabilityBoard
          view={view}
          order={order}
          todayIdx={todayIdx}
          /**
           * ⚠️ خانه‌ها روی **سرور** ساخته می‌شوند: قاعدهٔ «مرخصی فقط خانهٔ
           * امروز را می‌گیرد» یک تصمیم است، نه شکل — و تصمیم نباید در
           * کلاینت تکرار شود.
           */
          rows={rows.map((r) => ({ ...r, cells: rowCells(r, order, todayIdx) }))}
          summary={{
            total: rows.length,
            withSchedule: rows.filter((r) => r.hasSchedule).length,
            availableNow: rows.filter((r) => r.availableNow).length,
          }}
          away={rows
            .filter((r) => r.onLeave)
            .map((r) => ({ id: r.id, name: r.name, until: r.leaveUntil ?? '' }))}
          running={timers.map((x) => ({ ...x, duration: formatElapsed(x.minutes) }))}
          none={rows.filter((r) => !r.hasSchedule).map((r) => ({ id: r.id, name: r.name }))}
          online={online.map((o) => ({ ...o, seen: o.seen.toISOString() }))}
          offices={options.offices}
          roles={options.roles}
        />
      )}
    </main>
  );
}
