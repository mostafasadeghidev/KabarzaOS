'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle,
} from '@/components/ui/item';
import { KindIcon } from '@/components/notification-bell';
import { KIND_LABEL, kindOf, structuredBody, toneOf } from '@/domain/notifications/display';
import { markAllReadAction, markReadAction } from '../_actions/notifications';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { cn } from '@/lib/utils';

export interface FeedItem {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string;
  isRead: boolean;
  createdAt: Date | string;
}

/** سقفِ فهرست — همان `FEED_LIMIT` ِ سرویس (۲۰۰)، برای خطِ «فقط آخرین‌ها». */
const LIMIT = 200;

/**
 * رنگِ آیکونِ ردیف بر پایهٔ معنا — پورتِ `kteam-notif-good` / `kteam-notif-bad`.
 * فقط آیکون رنگ می‌گیرد، نه کلِ ردیف (همان قاعدهٔ توست در DESIGN.md).
 */
const TONE_MEDIA = {
  good: 'border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  bad: 'border-transparent bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
} as const;

export function MarkAllReadButton() {
  const tr = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => start(async () => { await markAllReadAction(); router.refresh(); })}
    >
      {pending ? <Spinner /> : <CheckCheck />}
      {tr('خواندنِ همه')}
    </Button>
  );
}

/**
 * فهرستِ اعلان‌ها با تبِ «خوانده‌نشده / همه».
 *
 * ⚠️ «مشاهده» اول خوانده می‌کند، بعد می‌برد — پورتِ `kteam_notif_open`. اگر
 * برعکس بود، پیمایش پیش از ثبتِ خواندن صفحه را عوض می‌کرد و اعلان خوانده‌نشده
 * می‌ماند.
 */
export function NotificationFeed({ items, showAll }: { items: FeedItem[]; showAll: boolean }) {
  const tr = useT();
  const tz = useTimeZone();
  const router = useRouter();
  const [pending, start] = useTransition();

  const open = (n: FeedItem) => start(async () => {
    if (!n.isRead) await markReadAction(n.id);
    router.push(n.url);
  });
  const read = (n: FeedItem) => start(async () => {
    await markReadAction(n.id);
    router.refresh();
  });

  return (
    <div className="grid gap-4">
      {/* فیلترِ یک فهرست → تبِ قرصی (DESIGN.md)؛ حالت در آدرس. */}
      <Tabs
        value={showAll ? 'all' : 'unread'}
        onValueChange={(v) => router.push(v === 'all' ? '/notifications?show=all' : '/notifications')}
      >
        <TabsList>
          <TabsTrigger value="unread" className="flex-none px-3">{tr('خوانده‌نشده‌ها')}</TabsTrigger>
          <TabsTrigger value="all" className="flex-none px-3">{tr('همه')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {items.length === 0 ? (
        <EmptyState title={showAll ? tr('اعلانی ندارید.') : tr('اعلانِ خوانده‌نشده‌ای ندارید.')} />
      ) : (
        <ItemGroup className="gap-2">
          {items.map((n) => {
            const tone = toneOf(n.type);
            const rows = n.body ? structuredBody(n.type, n.body) : null;
            return (
              <Item key={n.id} variant="outline" size="sm" className="items-start gap-3 p-3">
                <ItemMedia variant="icon" className={cn('mt-0.5', tone && TONE_MEDIA[tone])}>
                  <KindIcon type={n.type} className="size-4" />
                </ItemMedia>
                <ItemContent className="gap-1">
                  <ItemTitle className={cn('flex-wrap', n.isRead ? 'font-medium' : 'font-semibold')}>
                    {!n.isRead && (
                      <span className="size-2 shrink-0 rounded-full bg-primary">
                        <span className="sr-only">{tr('خوانده‌نشده')}</span>
                      </span>
                    )}
                    {/* ⚠️ عنوانِ ذخیره‌شده خودش کلیدِ ترجمه است (R-I18N-01)؛ بدنه داده است. */}
                    {tr(n.title)}
                  </ItemTitle>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {tr(KIND_LABEL[kindOf(n.type)])}
                    <span aria-hidden>·</span>
                    <span className="num">{formatDateTime(n.createdAt, tz)}</span>
                  </p>
                  {n.body && (
                    rows ? (
                      <dl className="grid gap-0.5 text-sm">
                        {rows.map((r) => (
                          <div key={r.label} className="flex gap-1.5">
                            <dt className="text-muted-foreground">{tr(r.label)}:</dt>
                            <dd>{r.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <ItemDescription className="line-clamp-none text-sm whitespace-pre-wrap text-foreground">
                        {n.body}
                      </ItemDescription>
                    )
                  )}
                </ItemContent>
                {/*
                  ⚠️ روی موبایل دکمه‌ها سطرِ خودشان را می‌گیرند: کنارِ متن، عنوان
                  را به ستونی دوکلمه‌ای فشرده می‌کردند (دیده شد).
                */}
                <ItemActions className="w-full justify-end sm:w-auto sm:self-center">
                  {!n.isRead && (
                    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => read(n)}>
                      <CheckCheck />
                      {tr('خوانده شد')}
                    </Button>
                  )}
                  {n.url && (
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => open(n)}>
                      {tr('مشاهده')}
                      <ArrowLeft className="ltr:rotate-180" />
                    </Button>
                  )}
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}

      {items.length >= LIMIT && (
        <p className="text-xs text-muted-foreground">
          {tr('فقط {n} اعلانِ آخر نشان داده می‌شود.', { n: LIMIT })}
        </p>
      )}
    </div>
  );
}
