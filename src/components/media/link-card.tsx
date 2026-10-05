import {
  Code2, ExternalLink, FileText, Globe, LayoutDashboard, Link2, Package, PenTool, Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { linkProvider, linkTitle, providerName, type LinkProvider } from '@/domain/files/link-preview';

/**
 * آیکون و کارتِ پیوندِ بیرونی (۲.۳.۰) — در توضیحِ پروژه و «منابع و لینک‌ها».
 *
 * ⚠️ آیکون‌ها نمادِ عمومی‌اند، نه لوگوی برند؛ رنگ فقط سرویس‌ها را از هم جدا
 * می‌کند. نامِ سرویس کنارش نوشته می‌شود، پس معنا به رنگ تکیه ندارد.
 */
const LOOK: Record<LinkProvider, { icon: typeof Link2; tint: string }> = {
  figma: { icon: PenTool, tint: 'bg-violet-500/12 text-violet-700 dark:text-violet-300' },
  webflow: { icon: Globe, tint: 'bg-blue-500/12 text-blue-700 dark:text-blue-300' },
  drive: { icon: FileText, tint: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  miro: { icon: LayoutDashboard, tint: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  video: { icon: Video, tint: 'bg-red-500/12 text-red-700 dark:text-red-300' },
  code: { icon: Code2, tint: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300' },
  dropbox: { icon: Package, tint: 'bg-sky-500/12 text-sky-700 dark:text-sky-300' },
  web: { icon: Link2, tint: 'bg-muted text-muted-foreground' },
};

export function LinkIcon({ href, className }: { href: string; className?: string }) {
  const { icon: Icon, tint } = LOOK[linkProvider(href)];
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tint, className)} aria-hidden>
      <Icon className="size-[18px]" />
    </span>
  );
}

/**
 * کارتِ یک پیوند: آیکونِ سرویس، عنوانِ خوانا، و زیرش برچسبِ کاربر یا نامِ سرویس.
 * ⚠️ `rel="noopener noreferrer nofollow"` — مثلِ همهٔ پیوندهای متنِ کاربر.
 */
export function LinkCard({ href, label }: { href: string; label: string | null }) {
  const title = linkTitle(href);
  const service = providerName(href);
  const sub = label && label.toLowerCase() !== title.toLowerCase() ? label : service;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={href}
      className="flex min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-muted/60"
    >
      <LinkIcon href={href} />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-medium" dir="auto">{title}</span>
        <span className="truncate text-xs text-muted-foreground" dir="auto">
          {sub === service ? service : `${service} · ${sub}`}
        </span>
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}
