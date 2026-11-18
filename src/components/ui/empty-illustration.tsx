'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Bell, MessageSquareText } from 'lucide-react';
import { ICONS, type NavItem } from '@/components/app-sidebar';

/**
 * تصویرِ حالتِ خالی (۳.۱۲.۰) — شبیهِ **منوی همان بخش**: آیکونِ آیتمِ منو (جلسات ← تقویم،
 * پیام‌ها ← حباب، …) وسطِ کارتِ جلویی، و رنگش همان رنگِ کاشیِ آن آیتم در سایدبار.
 *
 * ⚠️ بخش از روی آدرس پیدا می‌شود، پس هیچ‌کدام از ۷۷ جای استفاده لازم نیست چیزی بفرستد. اگر صفحه
 * آیکونِ خودش را داده باشد، همان می‌ماند. رنگ از `--wp-ih` ِ همان آیتمِ منو خوانده می‌شود (لایهٔ ظاهری
 * کاشی‌ها را با آن رنگ می‌کند)؛ منو که نباشد (گوشی، منوی بسته) ← رنگِ پالت.
 */
const ROUTES: Array<[string, NavItem['icon']]> = [
  ['/dashboard', 'overview'], ['/projects', 'projects'], ['/tasks', 'tasks'], ['/meetings', 'meetings'],
  ['/messages', 'messages'], ['/hours', 'hours'], ['/members', 'members'], ['/clients', 'clients'],
  ['/access', 'access'], ['/finance', 'finance'], ['/my-money', 'finance'], ['/reports', 'reports'],
  ['/my-schedule', 'schedule'], ['/activity', 'activity'], ['/mail', 'mail'], ['/library', 'library'],
  ['/team', 'team'], ['/availability', 'availability'], ['/onboarding', 'onboarding'],
  ['/settings', 'settings'], ['/profile', 'profile'],
];
const EXTRA: Array<[string, typeof Bell]> = [['/notifications', Bell], ['/comments', MessageSquareText]];

function sectionOf(pathname: string) {
  const hit = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const route = ROUTES.find(([p]) => hit(p));
  if (route) return { href: route[0], Icon: ICONS[route[1]] };
  const extra = EXTRA.find(([p]) => hit(p));
  return extra ? { href: extra[0], Icon: extra[1] } : null;
}

export function EmptyIllustration({ icon }: { icon?: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const section = sectionOf(pathname);
  const [hue, setHue] = React.useState<string | null>(null);

  // رنگِ کاشیِ همان آیتمِ منو — پس از سوار شدن، چون سایدبار در DOM است.
  React.useEffect(() => {
    if (!section) return;
    const link = document.querySelector(`[data-sidebar="menu-button"][href="${section.href}"]`);
    const value = link?.closest('[data-slot="sidebar-menu-item"]')
      ? getComputedStyle(link.closest('[data-slot="sidebar-menu-item"]')!).getPropertyValue('--wp-ih').trim()
      : '';
    setHue(value || null);
  }, [section?.href]);

  const SectionIcon = section?.Icon;

  /*
   * رنگ‌ها در لایهٔ ظاهری (`[data-empty-art][data-hue]`) — همان فرمولِ کاشی‌های منو، با نسخهٔ تیره.
   * بی رنگِ منو: رنگِ پالت (کلاس‌های text-primary/bg-primary).
   */
  return (
    <div data-empty-art data-hue={hue ? '' : undefined}
      className="relative mx-auto mb-1 h-24 w-36 text-primary" style={hue ? { ['--wp-ih' as string]: hue } : undefined} aria-hidden>
      <svg viewBox="0 0 144 96" className="absolute inset-0 size-full overflow-visible">
        <ellipse cx="72" cy="52" rx="62" ry="38" fill="currentColor" opacity="0.10" />
        <ellipse cx="96" cy="30" rx="22" ry="16" fill="currentColor" opacity="0.07" />
        <g transform="rotate(-8 56 50)">
          <rect x="30" y="26" width="58" height="46" rx="9" fill="var(--color-card)" stroke="var(--color-border)" />
          <rect x="39" y="38" width="30" height="4" rx="2" fill="var(--color-border)" />
          <rect x="39" y="47" width="22" height="4" rx="2" fill="var(--color-border)" />
        </g>
        <rect x="52" y="20" width="62" height="52" rx="10" fill="var(--color-card)" stroke="var(--color-border)" />
        <path d="M22 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="currentColor" opacity="0.55" />
        <path d="M124 70 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4 -3.4 -3.4 -1.4 3.4 -1.4z" fill="currentColor" opacity="0.45" />
        <circle cx="118" cy="16" r="2.2" fill="currentColor" opacity="0.35" />
      </svg>
      {/* کاشیِ آیکون — همان شکلِ کاشیِ منو، بزرگ‌تر، وسطِ کارتِ جلویی. */}
      <span
        data-empty-tile
        className="absolute grid size-11 place-items-center rounded-xl bg-primary/12 [&>svg]:size-[22px]"
        style={{ left: 83 - 22, top: 46 - 22 }}
      >
        {icon ?? (SectionIcon ? <SectionIcon /> : <span className="block h-1.5 w-6 rounded-full bg-current opacity-40" />)}
      </span>
    </div>
  );
}
