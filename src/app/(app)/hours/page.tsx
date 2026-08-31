import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import {
  canUseTimesheet, loggableProjects, myLogs, myTotals, timerState,
} from '@/server/timelogs/service';
import { EmptyState } from '@/components/ui/empty-state';
import { toDateString } from '@/domain/timelogs/timer';
import { HoursView } from './hours-view';
import { primeTranslations, t } from '@/i18n/server';

/** ساعتِ کاری — تایمر، ثبتِ دستی و فهرستِ ثبت‌های خودِ کاربر. */
export default async function HoursPage() {
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

  /**
   * ⚠️ گاردِ مستقلِ صفحه (R-ARCH-01): پنهان‌بودنِ آیتمِ منو گارد نیست.
   * ساعت را فقط عضوِ تیم ثبت می‌کند؛ بقیه ساعتِ تیم را در «تیمِ من» و
   * گزارش‌ها می‌بینند، نه اینجا.
   */
  if (!canUseTimesheet(actor)) {
    return (
      <main className="p-6">
        <EmptyState
          title={t("این بخش برای اعضای تیم است")}
          description={t("ثبتِ ساعت کارِ اعضاست؛ ساعتِ تیم را در «تیمِ من» و گزارش‌ها می‌بینید.")}
        />
      </main>
    );
  }

  const now = new Date();
  const [state, projects, logs, totals] = await Promise.all([
    timerState(actor, now),
    loggableProjects(actor),
    myLogs(actor, 60, now),
    myTotals(actor, now),
  ]);

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("ساعت کاری")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("تایمر روی سرور می‌شمارد؛ بستنِ مرورگر چیزی را از بین نمی‌برد.")}
        </p>
      </header>

      <HoursView
        data={{
          running: state.running,
          pending: state.pending,
          projects,
          logs,
          totals,
          today: toDateString(now),
        }}
      />
    </main>
  );
}
