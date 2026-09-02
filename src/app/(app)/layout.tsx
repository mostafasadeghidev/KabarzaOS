import { unreadMessageCount } from '@/server/messaging/service';
import { getCompany } from '@/server/people/profile-service';
import { redirect } from 'next/navigation';
import { currentSession } from '@/server/auth';
import { can, canViewSection, type Permission, type Role, type Section } from '@/domain/access/permissions';
import { AppSidebar, type NavItem } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { CommandPalette, CommandPaletteTrigger } from '@/components/command-palette';
import { OffboardedShell } from './offboarded-shell';
import { PresenceHeartbeat } from '@/components/presence';
import { logout } from '@/app/login/actions';
import { setLocale } from './_actions/locale';
import { markAllReadAction, markReadAction } from './_actions/notifications';
import { listNotifications } from '@/server/notifications/service';
import { TelegramNudge } from '@/components/telegram-nudge';
import { shouldShowTelegramNudge } from './_actions/telegram-nudge';
import { hasTeamScope } from '@/server/team/service';
import { hasTeamAvailability } from '@/server/availability/service';
import { NotificationBell } from '@/components/notification-bell';
import { getSystemConfig } from '@/server/settings/system-service';
import { t } from '@/i18n/server';
import { canUseTimesheet, timerState } from '@/server/timelogs/service';
import { TimerBanner } from '@/components/timer-banner';

/**
 * چیدمانِ اپ — سایدبار + محتوا.
 *
 * ⚠️ R-RBAC-05 لایهٔ اول — فهرستِ منو **روی سرور** فیلتر می‌شود، نه در کلاینت.
 * پنهان‌کردنِ آیتم در مرورگر گارد نیست؛ هر صفحه هم مستقل گارد دارد.
 */
const NAV: Array<NavItem & {
  section?: Section;
  permission?: Permission;
  /** فقط برای نقشِ «عضوِ تیم» — بی‌ربط به مجوزِ بخش. */
  memberOnly?: boolean;
  /**
   * مجوزهای **جایگزین**: یکی‌شان کافی است. برای صفحه‌ای که چند مخاطبِ
   * متفاوت دارد و هر کدام بخشِ خودشان را می‌بینند.
   */
  orPermissions?: Permission[];
  /** علاوه بر مجوزها، عضوِ تیم هم می‌بیند (چون دادهٔ خودش آنجاست). */
  orMember?: boolean;
}> = [
  { href: '/dashboard', label: t("نمای کلی"), icon: 'overview', group: 'operations', section: 'projects' },
  { href: '/projects', label: t("پروژه‌ها"), icon: 'projects', group: 'operations', section: 'projects' },
  // ⚠️ تسک‌های **خودِ** کاربر — دادهٔ شخصی است، پس همان گاردِ پروژه‌ها کافی است.
  { href: '/tasks', label: t("تسک‌های من"), icon: 'tasks', group: 'operations', section: 'projects' },
  { href: '/meetings', label: t("جلسات"), icon: 'meetings', group: 'operations', section: 'meetings' },
  { href: '/messages', label: t("پیام‌ها"), icon: 'messages', group: 'operations', section: 'messages' },
  /**
   * ⚠️ «ساعت کاری» بخشِ **عضو** است، نه بخشِ پروژه‌ها: مدیرِ کل ساعت ثبت
   * نمی‌کند، پس منویی هم که فقط فرمِ ثبت دارد برایش ساخته نمی‌شود.
   * دیدنِ ساعتِ تیم جای دیگری است — «تیمِ من» و گزارش‌ها.
   */
  { href: '/hours', label: t("ساعت کاری"), icon: 'hours', group: 'operations', memberOnly: true },
  { href: '/members', label: t("اعضا"), icon: 'members', group: 'data', section: 'members' },
  // کارفرمایان هم زیرِ همان بخشِ «اعضا» گارد می‌شوند — در نسخهٔ قبلی هم یک صفحهٔ پایه‌اند.
  { href: '/clients', label: t("کارفرمایان"), icon: 'clients', group: 'data', section: 'members' },
  { href: '/finance', label: t("مالی"), icon: 'finance', group: 'data', section: 'finance' },
  { href: '/reports', label: t("گزارش‌ها"), icon: 'reports', group: 'data', section: 'reports' },
  /**
   * ⚠️ این صفحه سه مخاطبِ متفاوت دارد و هر کدام تکهٔ خودشان را می‌بینند:
   * خوراکِ رویدادها (`activity.view`)، ماتریسِ در دسترس بودنِ تیم
   * (`members.view`)، و برنامهٔ هفتگی و مرخصیِ **خودِ** کاربر (هر عضوی).
   *
   * پیش از این فقط با `activity.view` باز می‌شد — که جز مالک و مالی کسی
   * ندارد. یعنی نه عضو می‌توانست ساعتِ کاری‌اش را ثبت کند، نه مدیرِ اعضا
   * ماتریسِ تیم را ببیند؛ و چون داده‌ای وارد نمی‌شد، ماتریس برای همیشه
   * خالی می‌ماند.
   */
  {
    href: '/activity', label: t("فعالیت"), icon: 'activity', group: 'data',
    permission: 'activity.view', orPermissions: ['members.view'], orMember: true,
  },
  // ⚠️ تنظیمات بخشِ دیدنی ندارد؛ با مجوزِ مدیریتش گارد می‌شود.
];

const ROLE_LABELS: Record<Role, string> = {
  owner: 'مدیرِ کل',
  admin: 'همکارِ ادمین',
  finance: 'مدیرِ مالی',
  member: 'عضوِ تیم',
  client: 'کارفرما',
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect('/login');
  const { actor } = session;

  /**
   * ⚠️ عضوِ سابقِ «فقط مالی» **هیچ صفحه‌ای از اپ را نمی‌بیند** — این نما
   * جای کلِ چیدمان را می‌گیرد، پس هر آدرسی هم که بزند همین را می‌بیند.
   * اگر به‌جایش یک صفحهٔ جدا می‌ساختیم، /projects همچنان باز بود.
   */
  if (session.memberState === 'finance') {
    return <OffboardedShell actor={actor} />;
  }

  /**
   * آیتم‌هایی که برای نقش‌های عضویت‌محور بازند — پورتِ داشبوردِ عضوِ نسخهٔ قبلی.
   * ⚠️ دادهٔ همهٔ این صفحه‌ها خودمحور یا عضویت‌محور است (گارد در سرویس)؛
   * ناوبری فقط درها را نشان می‌دهد، درها خودشان قفل دارند.
   */
  const isMember = actor.roles.includes('member');
  const isClient = actor.roles.includes('client');
  const membershipHrefs = new Set<string>([
    ...(isMember ? ['/projects', '/tasks', '/meetings', '/messages'] : []),
    ...(isClient ? ['/projects', '/tasks', '/messages'] : []),
  ]);

  // پورتِ افزونه: «ساعت کاری» برای هر که می‌تواند ساعت بزند (عضو، مالک، مالی، مدیرِ دفتر).
  const showHours = await canUseTimesheet(actor);
  const items: NavItem[] = NAV
    .filter((item) => {
      if (item.memberOnly) return showHours;
      if (item.permission) {
        return can(actor, item.permission)
          || (item.orPermissions ?? []).some((p) => can(actor, p))
          || Boolean(item.orMember && isMember);
      }
      return canViewSection(actor, item.section!) || membershipHrefs.has(item.href);
    })
    .map(({ href, label, icon, group }) => ({ href, label, icon, group }));

  /**
   * «تیمِ من» مجوزِ ثابت ندارد — به داشتنِ دفترِ تحتِ مدیریت وابسته است.
   * ⚠️ اگر دفتری نداشته باشد، منو اصلاً ساخته نمی‌شود؛ منویی که همیشه خالی
   * است فقط سردرگم‌کننده است.
   */
  // ⚠️ پروفایل و تنظیمات عمداً در سایدبار نیستند: جای متعارفشان منوی
  // حسابِ کاربر در پایینِ سایدبار است، و سایدبار برای کارِ روزمره می‌ماند.

  if (await hasTeamScope(actor)) {
    items.push({ href: '/team', label: t("تیمِ من"), icon: 'team', group: 'operations' });
  }

  /**
   * «در دسترس بودن اعضا» — مثلِ «تیمِ من» مجوزِ ثابت ندارد.
   *
   * ⚠️ دو در ورودی دارد: `members.view` (کلِ تیم) یا مدیریتِ دفتر (تیمِ خودش).
   * با گاردِ مجوزیِ تنها، **مدیرِ دفتر** هرگز این را نمی‌دید — همان نقشی که
   * بیش از همه به «امروز چه کسی سرِ کار است» نیاز دارد و در نسخهٔ قبلی
   * مسیرِ اختصاصیِ خودش را داشت.
   */
  if (await hasTeamAvailability(actor)) {
    items.push({
      href: '/availability', label: t("در دسترس بودن"), icon: 'availability', group: 'data',
    });
  }

  const primaryRole = actor.roles[0];
  const [bell, system, unreadMessages, showTgNudge, timer, brand] = await Promise.all([
    listNotifications(actor),
    getSystemConfig(),
    unreadMessageCount(actor),
    shouldShowTelegramNudge(actor),
    // پورتِ `timer_banner()`: تایمرِ روشن/پارک‌شده روی **هر** صفحه دیده می‌شود.
    showHours ? timerState(actor) : Promise.resolve(null),
    /**
     * ⚠️ `getCompany()` بازیگر نمی‌خواهد و گاردی ندارد — نام و لوگو
     * اطلاعاتِ عمومیِ شرکت‌اند و همان چیزی که روی سربرگِ فاکتور هم می‌آید.
     */
    getCompany(),
  ]);

  return (
    // ⚠️ سقفِ پهنا روی همین پوسته، نه روی هر صفحه: ۱۹۲۰ پیکسل و وسط‌چین
    // (`--shell-max` در globals.css). سایدبارِ fixed هم با `--shell-inset`
    // همان‌قدر جابه‌جا می‌شود — وگرنه محتوا وسط می‌رفت و سایدبار به لبهٔ
    // پنجره می‌چسبید.
    <SidebarProvider className="mx-auto max-w-(--shell-max)">
      {/* R-I18N-14 — زبانِ **مؤثر** پاس می‌شود: انتخابِ خودِ کاربر، وگرنه
          پیش‌فرضِ سامانه. `system` همین بالا لود شده، پس پرس‌وجوی تازه‌ای
          لازم نیست. */}
      <AppSidebar
        items={items}
        userName={session.name}
        userRole={primaryRole ? t(ROLE_LABELS[primaryRole]) : t('کاربر')}
        locale={session.locale ?? system.defaultLocale}
        pulse={{ enabled: system.pulseEnabled, interval: system.pulseInterval }}
        unreadMessages={unreadMessages}
        onLogout={logout}
        canManageSettings={can(actor, 'settings.manage')}
        onLocaleChange={setLocale}
        brand={{ name: brand.name?.trim() || 'KabarzaOS', logoFileId: brand.logoFileId }}
      />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <span className="text-sm font-medium">KabarzaOS</span>
          <div className="ms-auto flex items-center gap-2">
            <CommandPaletteTrigger />
            <NotificationBell
              items={bell.items}
              unread={bell.unread}
              onRead={markReadAction}
              onReadAll={markAllReadAction}
              pulse={{ enabled: system.pulseEnabled, interval: system.pulseInterval }}
            />
          </div>
        </header>
        {showTgNudge && <TelegramNudge />}
        {timer && (timer.running || timer.pending) && (
          <TimerBanner
            running={timer.running ? { projectTitle: timer.running.projectTitle, minutes: timer.running.minutes } : null}
            pending={timer.pending ? { projectTitle: timer.pending.projectTitle, minutes: timer.pending.minutes } : null}
          />
        )}
        {children}
        {/* صفحه‌ها همان فهرستِ منو است — یعنی همان فیلترِ مجوزِ سمتِ سرور. */}
        <CommandPalette pages={items.map(({ href, label }) => ({ href, label }))} />
        {/*
          ضربانِ حضور — سبک و بی‌صدا.
          ⚠️ وقتی حضور خاموش است اصلاً سوار نمی‌شود؛ نه اینکه بفرستد و
          سرور دور بریزد. هزینهٔ درخواستِ بی‌مصرف روی مرورگرِ کاربر است.
        */}
        {system.presenceEnabled && <PresenceHeartbeat ping={system.presencePing} />}
      </SidebarInset>
    </SidebarProvider>
  );
}
