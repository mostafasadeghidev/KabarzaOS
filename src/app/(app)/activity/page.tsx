import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { actionLabel, listAbsences, listActivity } from '@/server/activity/service';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { getWeek } from '@/server/availability/service';
import {
  leaveTargets, listAbsences as listMyAbsences,
} from '@/server/availability/absence-service';
import { weekOrder, type Slot } from '@/domain/availability/weekly';
import { can } from '@/domain/access/permissions';
import { getSystemConfig } from '@/server/settings/system-service';
import { ActivityView } from './activity-view';
import { primeTranslations, t } from '@/i18n/server';

/** فعالیت و حضور — از همان لاگِ ممیزی که هر سرویس در آن می‌نویسد. */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
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

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);

  /**
   * ⚠️ نبودنِ مجوزِ «فعالیت» فقط **خوراکِ رویدادها** را خالی می‌کند، نه کلِ صفحه.
   *
   * پیش از این اینجا `return` بود و صفحه با «دسترسی ندارید» تمام می‌شد — که
   * یعنی برنامهٔ هفتگی و فرمِ مرخصیِ **خودِ کاربر** هم هرگز رندر نمی‌شد.
   * `activity.view` را فقط owner و finance دارند (`member: []`)، پس هیچ عضوی
   * نمی‌توانست ساعتِ کاری‌اش را ثبت کند و ماتریسِ تیم برای همیشه خالی می‌ماند.
   * بقیهٔ همین تابع از اول همین را می‌گفت — «برنامهٔ هفتگیِ خودِ کاربر همیشه» —
   * و آن `return` حرفش را نقض می‌کرد.
   */
  let feed: Awaited<ReturnType<typeof listActivity>> | null = null;
  try {
    feed = await listActivity(actor, { page });
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
  }

  // مرخصی مجوزِ دیگری دارد؛ نبودنش نباید کلِ صفحه را از کار بیندازد.
  let absences: Awaited<ReturnType<typeof listAbsences>> = [];
  try {
    absences = await listAbsences(actor, { from: monthAgo, to: today });
  } catch { /* بدونِ دسترسیِ اعضا، بخشِ مرخصی خالی می‌ماند. */ }

  // برنامهٔ هفتگیِ خودِ کاربر همیشه؛ ماتریسِ تیم فقط با دسترسیِ اعضا.
  // ⚠️ ترتیبِ ستون‌ها از تنظیماتِ سامانه می‌آید — نه ثابتِ «شنبه».
  const [mineMap, system, myAbsences, targets] = await Promise.all([
    getWeek(actor.id),
    getSystemConfig(),
    // ⚠️ مرخصیِ **خودِ** کاربر مجوزِ بخش نمی‌خواهد؛ جدولِ تیمیِ بالا می‌خواهد.
    // پورتِ `for_user(upcoming_only)`: فهرستِ خودِ عضو فقط بازه‌های امروز به بعد.
    listMyAbsences(actor, actor.id, { upcomingOnly: true }),
    leaveTargets(actor),
  ]);

  // Map به شیء تبدیل می‌شود تا از مرزِ سرور/کلاینت رد شود.
  const toRecord = (m: Map<number, Slot[]>) => Object.fromEntries(m) as Record<number, Slot[]>;

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("فعالیت")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("آخرین رویدادهای سامانه و مرخصی‌های ثبت‌شده.")}
        </p>
      </header>

      <ActivityView
        events={(feed?.rows ?? []).map((r) => ({ ...r, label: actionLabel(r.action) }))}
        paging={{
          page: feed?.page ?? 1,
          totalPages: feed?.totalPages ?? 1,
          total: feed?.total ?? 0,
        }}
        canSeeFeed={feed !== null}
        absences={absences}
        leave={{ mine: myAbsences, targets, meId: actor.id, today }}
        availability={{
          mine: toRecord(mineMap),
          order: weekOrder(system.weekStart),
        }}
      />
    </main>
  );
}
