import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { getDashboard } from '@/server/dashboard';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CardGroup, CompactCard, DashHeading, DashPanel, MetricCard, RiskList,
} from '@/components/ui/dash';
import { MemberHoursChart, StatusChart, WeeklyTrendChart } from './charts';
import { activeLocale, primeTranslations, t } from '@/i18n/server';
import { intlTag } from '@/i18n/config';

/**
 * داشبورد.
 * ساختار و محتوا ← نسخهٔ قبلیِ K-Team (چهار بلوک)
 * زبانِ بصری ← dashboard-01 رسمیِ shadcn (کارت‌های گرادیانی با بجِ روند)
 */

/**
 * ⚠️ تقویم از **زبانِ کاربر** می‌آید، نه `fa-IR` ِ هاردکد. کاربرِ انگلیسی
 * پیش‌تر «شنبه ۷ شهریور ۱۴۰۵» می‌دید — با ارقامِ فارسی — که نه فقط ترجمه‌نشده
 * که ناخواناست (R-I18N-12).
 */
function todayLabel(): string {
  return new Intl.DateTimeFormat(intlTag(activeLocale()), {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date());
}

function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat(intlTag(activeLocale()), {
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

/** جملهٔ کوتاهِ وضعیت برای پانوشتِ کارت. */
function trendLine(delta: number, unit: string): string {
  if (delta > 0) return t('{n} {unit} بیشتر از هفتهٔ قبل', { n: delta, unit });
  if (delta < 0) return t('{n} {unit} کمتر از هفتهٔ قبل', { n: Math.abs(delta), unit });
  return t('بدون تغییر نسبت به هفتهٔ قبل');
}

export default async function DashboardPage() {
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
    data = await getDashboard(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <main className="p-6">
          <EmptyState title={t("دسترسی ندارید")} description={t("برای دیدنِ داشبورد از مدیر دسترسی بگیرید.")} />
        </main>
      );
    }
    throw error;
  }

  const { actionGroups, progress, today, risk, stats, charts } = data;
  const hasRisk =
    risk.overdue.length + risk.soon.length + risk.stalled.length + risk.openTenders.length > 0;

  // ⚠️ خودِ واحد هم ترجمه می‌شود، نه فقط جملهٔ دورش — وگرنه در انگلیسی
  // «1 fewer تسک than last week» درمی‌آید.
  const units = [t('تسک'), t('کامنت'), t('ساعت')];

  return (
    <main className="@container/main flex flex-col gap-6 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("داشبورد")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{todayLabel()}</p>
      </header>

      {/* پیشرفتِ این هفته — کارت‌های بزرگ با بجِ روند */}
      <section className="flex flex-col gap-3">
        <DashHeading>{t("پیشرفتِ این هفته")}</DashHeading>
        <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          {progress.map((card, i) => (
            <MetricCard
              key={card.label}
              label={t(card.label)}
              value={card.value}
              trend={card.delta}
              headline={trendLine(card.delta, units[i] ?? '')}
              hint={t("نسبت به هفتهٔ گذشته")}
              href={card.href}
            />
          ))}
          <MetricCard
            label={t("پروژه‌های در حال انجام")}
            value={stats.inProgress}
            headline={t('{n} پروژه در مرحلهٔ مذاکره', { n: stats.lead })}
            hint={t('{n} تسکِ باز روی همهٔ پروژه‌ها', { n: stats.openTasks })}
            href="/projects"
          />
        </div>
      </section>

      {/* منتظرِ اقدام — گروه‌بندی‌شده، مثلِ نسخهٔ قبلی */}
      <section className="flex flex-col gap-3">
        <DashHeading>{t("منتظرِ اقدام")}</DashHeading>
        <div className="grid gap-3 @3xl/main:grid-cols-3">
          {actionGroups.map((group) => (
            <CardGroup key={group.title} title={t(group.title)}>
              {group.cards.map((card) => (
                <CompactCard key={card.label} value={card.value} label={t(card.label)} href={card.href} />
              ))}
            </CardGroup>
          ))}
        </div>
      </section>

      {/* نمودارها */}
      <section className="flex flex-col gap-3">
        <DashHeading>{t("روند و توزیع")}</DashHeading>
        <div className="grid gap-3 @5xl/main:grid-cols-2">
          <DashPanel title={t("روندِ ساعتِ کاریِ تیم")}>
            {charts.weeklyTrend.every((w) => w.hours === 0) ? (
              <p className="text-sm text-muted-foreground">{t("ساعتِ کاری ثبت نشده.")}</p>
            ) : (
              <WeeklyTrendChart data={charts.weeklyTrend} />
            )}
          </DashPanel>
          <DashPanel title={t("وضعیتِ پروژه‌ها")}>
            {charts.statusDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("پروژه‌ای نیست.")}</p>
            ) : (
              <StatusChart data={charts.statusDistribution} />
            )}
          </DashPanel>
          <DashPanel title={t("ساعتِ کاریِ اعضا (۳۰ روزِ گذشته)")} >
            {charts.memberHours.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ساعتِ کاری ثبت نشده.")}</p>
            ) : (
              <MemberHoursChart data={charts.memberHours} />
            )}
          </DashPanel>
        </div>
      </section>

      {/* امروز */}
      <section className="flex flex-col gap-3">
        <DashHeading>{t("امروز")}</DashHeading>
        <div className="grid gap-3 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          <DashPanel title={t("جلساتِ این هفته")}>
            {today.meetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("جلسه‌ای ثبت نشده.")}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {today.meetings.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">{m.title}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">{timeLabel(m.meetAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </DashPanel>

          <DashPanel title={t("در مرخصیِ امروز")}>
            {today.away.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("همه سرِ کارند.")}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {today.away.map((a) => <li key={a.userId}>{a.name}</li>)}
              </ul>
            )}
          </DashPanel>

          {/*
            «در دسترسِ امروز» = برنامهٔ هفتگی‌اش امروز را دارد و مرخصی هم نیست.
            ⚠️ فهرستِ خالی دو معنا دارد و باید تفکیک شود: یا کسی برنامه نداده،
            یا همه مرخصی‌اند. جملهٔ مبهم بدتر از نبودنش است.
          */}
          <DashPanel title={t("در دسترسِ امروز")}>
            {today.available.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {today.away.length > 0
                  ? t('کسی خارج از مرخصی برنامه ندارد.')
                  : t('هنوز کسی برنامهٔ هفتگی نداده.')}
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {today.available.map((a) => <li key={a.userId}>{a.name}</li>)}
              </ul>
            )}
          </DashPanel>

          <DashPanel title={t("تیم")}>
            <div className="flex gap-2">
              <CompactCard value={today.activeTeam} label={t("عضوِ فعال")} />
              <CompactCard value={today.assignedMembers} label={t("درگیرِ پروژه")} />
            </div>
          </DashPanel>
        </div>
      </section>

      {/* ریسک و نیازمندِ توجه */}
      <section className="flex flex-col gap-3">
        <DashHeading>{t("ریسک و نیازمندِ توجه")}</DashHeading>
        {!hasRisk ? (
          <DashPanel title={t("وضعیت")}>
            <p className="text-sm text-muted-foreground">{t("هیچ ریسکی شناسایی نشد.")}</p>
          </DashPanel>
        ) : (
          <div className="grid gap-3 @3xl/main:grid-cols-2">
            <DashPanel title={t("ددلاینِ گذشته")} action={{ href: '/projects', label: t("پروژه‌ها") }}>
              <RiskList items={risk.overdue} empty={t("موردی نیست.")} tone="danger" />
            </DashPanel>
            <DashPanel title={t("ددلاینِ نزدیک")}>
              <RiskList items={risk.soon} empty={t("موردی نیست.")} tone="warning" />
            </DashPanel>
            <DashPanel title={t("پروژه‌های راکد")}>
              <RiskList items={risk.stalled} empty={t("موردی نیست.")} />
            </DashPanel>
            <DashPanel title={t("مناقصه‌های باز")}>
              <RiskList items={risk.openTenders} empty={t("موردی نیست.")} />
            </DashPanel>
          </div>
        )}
      </section>
    </main>
  );
}
