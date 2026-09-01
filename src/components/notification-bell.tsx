'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { LiveCount, usePulse } from '@/components/pulse';
import { Bell, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n/client';

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string;
  isRead: boolean;
  createdAt: Date | string;
}

function when(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * زنگِ اعلان — شمارِ خوانده‌نشده روی آیکون، و فهرستِ آخرین اعلان‌ها.
 *
 * ⚠️ کلیک روی یک اعلان آن را خوانده می‌کند و به مقصدش می‌برد؛ خوانده‌نشده‌ها
 * پررنگ‌اند تا در فهرست گم نشوند (R-NOTIF-06 در سطحِ نمایش).
 */
export function NotificationBell({
  items,
  unread,
  onRead,
  onReadAll,
  pulse,
}: {
  items: NotificationItem[];
  unread: number;
  onRead: (id: number) => Promise<void>;
  onReadAll: () => Promise<void>;
  /** تنظیماتِ نبضِ زنده؛ خاموش یعنی عدد فقط با بارگذاریِ صفحه تازه می‌شود. */
  pulse: { enabled: boolean; interval: number };
}) {
  const tr = useT();
  const t = useT();
  const [open, setOpen] = useState(false);
  const live = usePulse(pulse.interval, pulse.enabled);

  /**
   * ⚠️ عددِ زنده فقط تا وقتی حاکم است که کاربر خودش چیزی نخوانده باشد.
   * پس از «خواندن»، مقدارِ سرور (که با revalidate تازه می‌شود) درست‌تر است —
   * وگرنه نبضِ کهنه عددِ پاک‌شده را برمی‌گرداند.
   */
  const shown = live?.notif ?? unread;
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="relative rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={shown > 0 ? t('اعلان‌ها ({n} خوانده‌نشده)', { n: shown }) : t('اعلان‌ها')}
      >
        <Bell className="size-4" />
        {shown > 0 && (
          <Badge className="absolute -top-1 -end-1 size-4 justify-center p-0 text-[10px]">
            <LiveCount initial={shown} live={null} max={9} />
          </Badge>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          {t('اعلان‌ها')}
          {unread > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground disabled:opacity-60"
              disabled={pending}
              onClick={() => startTransition(async () => { await onReadAll(); })}
            >
              <CheckCheck className="size-3.5" />
              {tr("خواندنِ همه")}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t("اعلانی ندارید.")}</p>
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.url || '#'}
                  onClick={() => {
                    setOpen(false);
                    if (!n.isRead) startTransition(async () => { await onRead(n.id); });
                  }}
                  className={`block rounded-md px-2 py-2 hover:bg-muted ${n.isRead ? '' : 'bg-primary/5'}`}
                >
                  {/*
                    ⚠️ عنوانِ ذخیره‌شده **خودش کلیدِ ترجمه است** (R-I18N-01):
                    متنِ فارسی در دیتابیس می‌نشیند و اینجا ترجمه می‌شود. پیش
                    از این خام رندر می‌شد، پس کاربرِ انگلیسی همهٔ اعلان‌ها را
                    فارسی می‌دید — با اینکه ترجمه‌شان در فایلِ زبان بود.
                    بدنه داده است (نامِ پروژه، مبلغ)، پس دست‌نخورده می‌ماند.
                  */}
                  <p className={`text-sm ${n.isRead ? '' : 'font-medium'}`}>{tr(n.title)}</p>
                  {n.body && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</p>
                  )}
                  <p className="num mt-0.5 text-[11px] text-muted-foreground">{when(n.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
