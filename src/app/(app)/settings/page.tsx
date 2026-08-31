import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { getSettings } from '@/server/settings/service';
import { listStaff } from '@/server/people/service';
import { getReportConfig } from '@/server/scheduler/daily-report';
import { getSystemConfig } from '@/server/settings/system-service';
import { getTelegramSettings } from '@/server/settings/telegram-service';
import { lastTickAt } from '@/server/scheduler/service';
import { schedulerHealth } from '@/domain/scheduler/health';
import { currentLockDate } from '@/server/finance/service';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { SettingsView } from './settings-view';
import { t } from '@/i18n/server';

/**
 * تنظیمات — فهرست‌های پایه.
 * ⚠️ مالک‌محور است: مجوزِ `settings.manage` هم برای دیدن لازم است، مثلِ نسخهٔ قبلی.
 */
export default async function SettingsPage() {
  const actor = await currentActor();
  if (!actor) redirect('/login');

  let data;
  try {
    // فهرستِ همکاران فقط برای مالک است؛ برای بقیه تبِ «دسترسی همکاران» خالی می‌ماند.
    const [settings, staff, reportConfig, systemConfig, lockDate, tick, telegram] = await Promise.all([
      getSettings(actor),
      listStaff(actor).catch(() => []),
      getReportConfig(),
      getSystemConfig(),
      currentLockDate(),
      lastTickAt(),
      // ⚠️ فقط «توکنی هست یا نه» — خودِ توکن هرگز به کلاینت نمی‌رود.
      getTelegramSettings(actor).catch(() => ({ hasToken: false, username: '', fromEnv: false })),
    ]);
    data = {
      ...settings, staff, reportConfig, systemConfig, lockDate, telegram,
      isOwner: actor.roles.includes('owner'),
      health: schedulerHealth(tick, new Date()),
      today: new Date().toISOString().slice(0, 10),
    };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <main className="p-6">
          <EmptyState title={t("دسترسی ندارید")} description={t("تنظیمات برای مدیرِ کل و مدیرِ مالی در دسترس است.")} />
        </main>
      );
    }
    throw error;
  }

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("تنظیمات")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("فهرست‌های پایه‌ای که همهٔ بخش‌ها از آن‌ها استفاده می‌کنند.")}
        </p>
      </header>

      <SettingsView data={data} />
    </main>
  );
}
