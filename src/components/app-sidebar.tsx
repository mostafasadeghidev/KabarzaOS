'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderKanban, Users, Wallet, BarChart3, CalendarCheck, CalendarDays, MessageSquare,
  LayoutDashboard, Building2, Settings, Activity, Clock, UsersRound, UserCircle, ListChecks,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from '@/components/ui/sidebar';
import { UserMenu } from '@/components/user-menu';
import { isRtl, type Locale } from '@/i18n/config';
import { useT } from '@/i18n/client';
import { LiveCount, usePulse } from '@/components/pulse';
import { Badge } from '@/components/ui/badge';

/**
 * سایدبارِ اپ.
 *
 * ⚠️ سمتِ سایدبار از **زبان** می‌آید، نه هاردکد: در فارسی/عربی/کردی سمتِ
 * راست و در انگلیسی/آلمانی و… سمتِ چپ. پیمایش همیشه جایی می‌نشیند که چشم
 * از آنجا شروع می‌کند؛ سایدبارِ سمتِ راست در رابطِ چپ‌به‌راست حس می‌دهد
 * صفحه وارونه است (R-I18N-11).
 *
 * R-RBAC-05 لایهٔ اول — فهرست روی سرور فیلتر می‌شود، نه در کلاینت.
 */

export type NavIcon =
  | 'overview' | 'projects' | 'members' | 'clients'
  | 'finance' | 'reports' | 'meetings' | 'messages' | 'settings' | 'activity' | 'hours' | 'team'
  | 'profile' | 'tasks' | 'availability';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  group: 'operations' | 'data';
}

const ICONS: Record<NavIcon, typeof FolderKanban> = {
  overview: LayoutDashboard,
  tasks: ListChecks,
  projects: FolderKanban,
  members: Users,
  clients: Building2,
  settings: Settings,
  activity: Activity,
  hours: Clock,
  team: UsersRound,
  profile: UserCircle,
  finance: Wallet,
  reports: BarChart3,
  meetings: CalendarDays,
  messages: MessageSquare,
  availability: CalendarCheck,
};

const GROUP_LABELS = {
  operations: 'عملیات',
  data: 'اطلاعات پایه',
} as const;

export function AppSidebar({
  items,
  userName,
  userRole,
  locale,
  pulse,
  unreadMessages,
  onLogout,
  canManageSettings,
  onLocaleChange,
  brand,
}: {
  items: NavItem[];
  /**
   * نام و لوگوی شرکت — سربرگِ سایدبار.
   * ⚠️ برای هر نقشی، چون یک سایدبار برای همه رندر می‌شود.
   */
  brand: { name: string; logoFileId: number | null };
  userName: string;
  userRole: string;
  locale: Locale;
  /** نبضِ زنده — همان تنظیمی که زنگِ اعلان می‌گیرد. */
  pulse: { enabled: boolean; interval: number };
  /** شمارِ اولیهٔ پیامِ خوانده‌نشده از سرور؛ نبض تازه‌اش می‌کند. */
  unreadMessages: number;
  onLogout: () => void;
  canManageSettings?: boolean;
  onLocaleChange: (locale: Locale) => void | Promise<void>;
}) {
  const t = useT();
  const pathname = usePathname();

  /**
   * ⚠️ همان نبضی که زنگِ اعلان می‌گیرد، اینجا دوباره صدا زده می‌شود — و
   * گران نیست: `usePulse` یک تایمرِ مستقل دارد ولی هر دو یک مسیرِ سبک را
   * می‌خوانند که فقط دو عدد برمی‌گرداند.
   *
   * ⚠️ روی خودِ صفحهٔ پیام‌ها بج پنهان می‌شود: کاربر همان‌جاست و عددِ
   * چشمک‌زن فقط نویز است — رفتارِ نسخهٔ قبلی هم همین است.
   */
  const live = usePulse(pulse.interval, pulse.enabled);
  const unread = pathname.startsWith('/messages') ? 0 : (live?.msg ?? unreadMessages);
  const groups = (['operations', 'data'] as const)
    .map((key) => ({ key, items: items.filter((i) => i.group === key) }))
    .filter((g) => g.items.length > 0);

  return (
    <Sidebar side={isRtl(locale) ? 'right' : 'left'} collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" prefetch={false}>
                {/*
                  ⚠️ لوگوی شرکت، اگر ثبت شده باشد — برای همهٔ نقش‌ها، چون
                  یک سایدبار برای همه رندر می‌شود. `object-contain` لازم
                  است: در حالتِ جمع‌شده همین مربعِ ۸ تنها چیزِ دیدنی است و
                  لوگوی کشیده‌شده بد می‌نشیند.
                */}
                {brand.logoFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${brand.logoFileId}?thumb`}
                    alt=""
                    className="aspect-square size-8 rounded-md object-contain"
                  />
                ) : (
                  <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <span className="text-sm font-bold">{brand.name.trim().slice(0, 1) || 'K'}</span>
                  </div>
                )}
                <div className="grid flex-1 text-start leading-tight">
                  <span className="truncate font-semibold">{brand.name}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel>{t(GROUP_LABELS[group.key])}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={t(item.label)}>
                        {/*
                          ⚠️ prefetch خاموش: کلِ محتوای این اپ per-user است
                          (زبان، مجوز، دامنهٔ دید). با prefetch، Next پاسخِ
                          RSC ِ هر لینکِ دیدهٔ سایدبار را کش می‌کند و بعد از
                          تعویضِ زبان همان کهنه را نشان می‌دهد — سایدبار
                          انگلیسی و محتوا فارسی، در یک صفحه. آزموده شد.
                        */}
                        <Link href={item.href} prefetch={false}>
                          <Icon />
                          <span>{t(item.label)}</span>
                          {item.icon === 'messages' && unread > 0 && (
                            <Badge className="ms-auto size-4 justify-center p-0 text-[10px]">
                              <LiveCount initial={unread} live={null} />
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu
              userName={userName}
              userRole={userRole}
              locale={locale}
              onLogout={onLogout}
              canManageSettings={canManageSettings}
              onLocaleChange={onLocaleChange}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
