import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { getMeetingFormOptions, listMeetings, listReminders } from '@/server/meetings/service';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { MeetingsView } from './meetings-view';
import { primeTranslations, t } from '@/i18n/server';

/** جلسات — دو تبِ `Meetings_Page`: «جلسات» و «یادآورهای من». */
export default async function MeetingsPage() {
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

  let data;
  try {
    data = await listMeetings(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <main className="p-6">
          <EmptyState title={t("دسترسی ندارید")} description={t("برای دیدنِ جلسات از مدیر دسترسی بگیرید.")} />
        </main>
      );
    }
    throw error;
  }

  // یادآور شخصی است و مجوزِ بخش نمی‌خواهد؛ گزینه‌های فرم فقط برای مدیر.
  const [reminders, options] = await Promise.all([
    listReminders(actor),
    data.canManage ? getMeetingFormOptions(actor) : Promise.resolve({ projects: [], offices: [] }),
  ]);

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("جلسات")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className="num">{data.meetings.length}</span> {t("جلسهٔ پیشِ‌رو")}
        </p>
      </header>

      <MeetingsView
        meetings={data.meetings}
        reminders={reminders}
        options={options}
        canManage={data.canManage}
      />
    </main>
  );
}
