'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useT } from '@/i18n/client';
import { useSidebar } from '@/components/ui/sidebar';
import { LiveCount } from '@/components/pulse';
import { ICONS, type NavItem } from '@/components/app-sidebar';
import { cn } from '@/lib/utils';

/**
 * نوارِ منوی پایینِ گوشی (۳.۱۲.۰) — مثلِ اپلیکیشن‌های موبایل: چهار بخشِ پرکاربرد همیشه زیرِ
 * انگشت، و «بیشتر» که همان منوی کناری را باز می‌کند. فقط زیرِ ۷۶۸px (همان مرزِ منوی کشوییِ سایدبار).
 *
 * ⚠️ آیتم‌ها از **همان فهرستِ منو** می‌آیند (فیلترِ مجوزِ سرور) — بخشی که کاربر حقش را ندارد این‌جا
 * هم نیست. ترتیبِ ترجیح: نمای کلی، پروژه‌ها، تسک‌ها، پیام‌ها؛ هر کدام نبود، بعدیِ منو جایش می‌نشیند.
 */
const PREFERRED = ['/dashboard', '/projects', '/tasks', '/messages'];

export function MobileBottomNav({ items, unread }: { items: NavItem[]; unread: number }) {
  const t = useT();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const picked: NavItem[] = [];
  for (const href of PREFERRED) {
    const hit = items.find((i) => i.href === href);
    if (hit) picked.push(hit);
  }
  for (const i of items) if (picked.length < 4 && !picked.includes(i)) picked.push(i);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      data-bottom-nav
      aria-label={t('منوی اصلی')}
      className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-2xl border bg-popover/95 p-1.5 shadow-lg backdrop-blur md:hidden"
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
    >
      {picked.slice(0, 4).map((item) => {
        const Icon = ICONS[item.icon];
        const on = active(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10.5px] font-medium transition-colors',
              on ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={cn('grid h-7 w-11 place-items-center rounded-full transition-colors', on && 'bg-primary/12')}>
              <Icon className="size-[19px]" />
            </span>
            <span className="max-w-full truncate">{item.label}</span>
            {item.icon === 'messages' && unread > 0 && (
              <span className="num absolute top-0.5 end-2 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
                <LiveCount initial={unread} live={null} />
              </span>
            )}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10.5px] font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="grid h-7 w-11 place-items-center rounded-full"><Menu className="size-[19px]" /></span>
        <span>{t('بیشتر')}</span>
      </button>
    </nav>
  );
}
