import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { myTasks, taskableProjects } from '@/server/projects/service';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { primeTranslations, t } from '@/i18n/server';
import { TaskTable } from './task-table';
import { TasksTabs } from './tasks-tabs';

/**
 * «تسک‌های شما» — پورتِ `view_tasks()` ِ داشبوردِ نسخهٔ قبلی.
 *
 * عضو: «جاری» و «در انتظارِ بررسی» — با قاعدهٔ دیدِ افزونه (تسکِ نقشیِ
 * ادعانشده هم می‌آید تا بشود برداشتش). کارفرما: تسک‌هایی که منتظرِ بررسیِ
 * اویند روی پروژه‌هایش.
 *
 * ⚠️ گاردِ خاصی ندارد چون دادهٔ **خودِ کاربر** است — کوئری فقط دیدنی‌های او
 * را می‌آورد (و دامنهٔ خصوصی هم در همان‌جا فیلتر می‌شود).
 */
export default async function MyTasksPage() {
  /**
   * ⚠️ هر صفحه **خودش** ترجمه را آماده می‌کند و به چیدمان تکیه نمی‌کند:
   * در ناوبریِ سمتِ کلاینت، Next فقط بخشِ صفحه را دوباره رندر می‌کند و
   * چیدمان را از درختِ کش‌شده برمی‌دارد.
   */
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const inbox = await myTasks(actor);

  if (inbox.kind === 'client') {
    /**
     * ⚠️ کارفرما دو دسته دارد و هر دو کارِ **اوست**: آنچه به خودش سپرده شده
     * (تأیید، فرستادنِ محتوا، امضا) و آنچه تیم برای بررسیِ او فرستاده.
     * پیش از این فقط دستهٔ دوم را می‌دید.
     */
    const total = inbox.active.length + inbox.review.length;
    return (
      // ⚠️ پهنای خواندنی: جدولِ تسک تا لبهٔ نمایشگر کش نمی‌آید.
      <main className="@container/main flex max-w-5xl flex-col gap-4 p-4 lg:p-6">
        <header>
          <h1 className="text-xl font-semibold">{t("تسک‌های شما")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('{n} تسکِ سپرده‌شده به شما', { n: inbox.active.length })}
            {inbox.review.length > 0 && <> · {t('{n} در انتظارِ بررسیِ شما', { n: inbox.review.length })}</>}
          </p>
        </header>

        {total === 0 ? (
          <EmptyState
            title={t("تسکی برای شما نیست")}
            description={t("وقتی کاری به شما سپرده شود یا تیم چیزی را برای بررسی بفرستد، اینجا می‌آید.")}
          />
        ) : (
          <div className="grid gap-4">
            {inbox.active.length > 0 && (
              <Card className="gap-2 py-4">
                <CardHeader className="px-4 pb-0">
                  <CardTitle className="text-sm">{t("سپرده‌شده به شما")}</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0"><TaskTable rows={inbox.active} empty="" /></CardContent>
              </Card>
            )}
            {inbox.review.length > 0 && (
              <Card className="gap-2 py-4">
                <CardHeader className="px-4 pb-0">
                  <CardTitle className="text-sm">{t("در انتظارِ بررسی")}</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0"><TaskTable rows={inbox.review} empty="" /></CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    );
  }

  const { active, waiting, review } = inbox;
  // پروژه‌هایی که همین کاربر می‌تواند رویشان تسک بزند — تبِ «افزودنِ سریع».
  const projects = await taskableProjects(actor);

  const inboxPanel = (
    <>
      {active.length === 0 && waiting.length === 0 && review.length === 0 ? (
        <EmptyState
          title={t("تسکی به شما سپرده نشده")}
          description={t("تسک‌هایی که به شما یا نقشتان سپرده شوند اینجا می‌آیند.")}
        />
      ) : (
        /**
         * ⚠️ یک ستون، نه دو: جدولِ تسک شش ستون دارد (تسک، اولویت، وضعیت،
         * پروژه، ددلاین، کنش) و در نیمهٔ صفحه اسکرولِ افقی می‌خورد. کارت‌ها
         * زیرِ هم و تمام‌عرض‌اند تا هر ستون جای خودش را داشته باشد.
         */
        <div className="grid gap-4">
          <Card className="gap-2 py-4">
            <CardHeader className="px-4 pb-0"><CardTitle className="text-sm">{t("تسک‌های جاری شما")}</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0"><TaskTable rows={active} empty={t("تسکِ جاری ندارید.")} filterable /></CardContent>
          </Card>
          <Card className="gap-2 py-4">
            <CardHeader className="px-4 pb-0"><CardTitle className="text-sm">{t("در انتظارِ بررسی")}</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0"><TaskTable rows={waiting} empty={t("موردی در انتظارِ بررسی نیست.")} /></CardContent>
          </Card>
          {/*
            ⚠️ فقط برای مدیر پر می‌شود (سرور تصمیم می‌گیرد): کارهایی که تیم
            روی پروژه‌های تحتِ مدیریتِ او برای بررسی فرستاده. تا امروز تنها
            راهِ دیدنشان بازکردنِ تک‌تکِ پروژه‌ها بود.
          */}
          {review.length > 0 && (
            <Card className="gap-2 py-4">
              <CardHeader className="px-4 pb-0">
                <CardTitle className="text-sm">{t("فرستاده‌شده برای بررسیِ شما")}</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0"><TaskTable rows={review} empty="" /></CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );

  return (
    <main className="@container/main flex max-w-6xl flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("تسک‌ها")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('{n} تسکِ جاری', { n: active.length })}
          {waiting.length > 0 && <> · {t('{n} در انتظارِ بررسی', { n: waiting.length })}</>}
        </p>
      </header>

      <TasksTabs
        inbox={inboxPanel}
        inboxCount={active.length + waiting.length}
        projects={projects}
        today={new Date().toISOString().slice(0, 10)}
      />
    </main>
  );
}
