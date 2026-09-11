'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { LiveCount, usePulse } from '@/components/pulse';
import {
  Bell, CalendarDays, CheckCheck, FolderKanban, ListChecks, Mail, MessageSquare, Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { KIND_LABEL, kindOf, structuredBody } from '@/domain/notifications/display';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string;
  isRead: boolean;
  createdAt: Date | string;
}

/** تاریخ/ساعت به وقتِ بیننده — نه UTC ِ خام (`useDateTime`). */
function when(value: Date | string | null | undefined, tz: string): string {
  return formatDateTime(value, tz);
}


function KindIcon({ type }: { type: string }) {
  const kind = kindOf(type);
  if (kind === 'task') return <ListChecks className="size-3" />;
  if (kind === 'comment') return <MessageSquare className="size-3" />;
  if (kind === 'meeting') return <CalendarDays className="size-3" />;
  if (kind === 'money') return <Wallet className="size-3" />;
  if (kind === 'message') return <Mail className="size-3" />;
  return <FolderKanban className="size-3" />;
}

/**
 * زنگِ اعلان — شمارِ خوانده‌نشده روی آیکون، و فهرستِ آخرین اعلان‌ها.
 *
 * ⚠️ کلیک روی یک اعلان **مودال** باز می‌کند، نه پیمایش. دو دلیل، هر دو از
 * گزارشِ واقعی:
 *
 *  · بدنهٔ اعلان در فهرست بریده می‌شود (`truncate`)، پس تنها راهِ خواندنِ
 *    کاملش ترکِ صفحه بود.
 *  · مقصد همیشه وجود ندارد. اعلانِ «پیامِ تازه» به `/messages/{id}` می‌رفت که
 *    مسیرش ساخته نشده بود: ۴۰۴ ِ خامِ Next، بیرون از پوستهٔ برنامه، بدونِ
 *    منو و بدونِ راهِ برگشت.
 *
 * مودال متن را کامل نشان می‌دهد و رفتن به مقصد را **اختیاری** می‌کند؛ پس
 * اعلانی که مقصدش هم بشکند باز خواندنی می‌ماند. خوانده‌نشده‌ها پررنگ‌اند تا
 * در فهرست گم نشوند (R-NOTIF-06 در سطحِ نمایش).
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
  const tz = useTimeZone();
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

  /**
   * ⚠️ عدد زنده بود ولی **فهرست نبود**. `items` در چیدمانِ سمتِ سرور ساخته
   * می‌شود و فقط با بارگذاریِ صفحه تازه می‌شود، در حالی که نبض هر چند ثانیه
   * شمارنده را جلو می‌برد. نتیجه دقیقاً همان چیزی بود که گزارش شد: عدد روی
   * زنگوله می‌افتد، اما بازکردنِ زنگوله فهرستِ قدیمی را نشان می‌دهد و تا
   * رفرشِ دستی خبری از اعلانِ تازه نیست.
   *
   * `router.refresh()` کامپوننت‌های سرور را دوباره می‌گیرد بی‌آنکه وضعیتِ
   * کلاینت (منوی باز) از دست برود.
   *
   * ⚠️ نگهبانِ حلقه: برای هر عدد فقط یک بار. بدونِ آن، اگر نبض از سرور جلو
   * بزند — که در فاصلهٔ بینِ نوشتنِ اعلان و کشِ صفحه پیش می‌آید — هر رندر
   * یک refresh ِ تازه می‌ساخت.
   */
  const router = useRouter();
  const refreshedFor = useRef<number | null>(null);
  useEffect(() => {
    const n = live?.notif;
    if (n === undefined || n === null || n === unread) return;
    if (refreshedFor.current === n) return;
    refreshedFor.current = n;
    router.refresh();
  }, [live?.notif, unread, router]);

  /**
   * ⚠️ مودال بیرونِ `DropdownMenuContent` است، نه داخلش: هر دو تلهٔ فوکوس
   * دارند و تودرتو که باشند، بستنِ منو مودال را هم می‌بندد.
   */
  const [reading, setReading] = useState<NotificationItem | null>(null);

  const openNotification = (n: NotificationItem) => {
    setOpen(false);
    setReading(n);
    if (!n.isRead) startTransition(async () => { await onRead(n.id); });
  };

  return (
    <>
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
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="font-normal text-muted-foreground"
              disabled={pending}
              onClick={() => startTransition(async () => { await onReadAll(); })}
            >
              <CheckCheck className="size-3.5" />
              {tr("خواندنِ همه")}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t("اعلانی ندارید.")}</p>
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openNotification(n)}
                  className={`block w-full rounded-md px-2 py-2 text-start hover:bg-muted ${n.isRead ? '' : 'bg-primary/5'}`}
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
                  {/*
                    ⚠️ دسته در خودِ فهرست: عنوانِ ذخیره‌شده برای یک رویداد چند
                    شکل دارد — «پیام جدید از سارا» و «پاسخِ تازه از سارا» هر دو
                    پیام‌اند — و کاربر از روی عنوان نمی‌فهمید با چه چیزی طرف
                    است. دسته از `type` می‌آید، پس هر دو «پیام» را نشان می‌دهند.
                  */}
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <KindIcon type={n.type} />
                    {tr(KIND_LABEL[kindOf(n.type)])}
                    <span aria-hidden>·</span>
                    <span className="num">{when(n.createdAt, tz)}</span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={reading !== null} onOpenChange={(o) => { if (!o) setReading(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{reading ? tr(reading.title) : ''}</DialogTitle>
          {/* زمانِ ثبت **فقط همین‌جا** — پیش‌تر یک بار هم سطرِ «زمان» بود و مودال دو بار یک عدد را می‌گفت. */}
          <DialogDescription className="num text-xs">
            {reading ? when(reading.createdAt, tz) : ''}
          </DialogDescription>
        </DialogHeader>

        {/*
          خط به خط: هر داده سطرِ خودش را دارد. پیش از این همه‌چیز یک پاراگرافِ
          خاکستری بود و معلوم نبود اعلان دربارهٔ چیست تا وقتی کاربر می‌رفت و
          می‌دید. سطرِ «مقصد» برداشته شد — دکمهٔ «مشاهده» همان را می‌گوید و
          تکرارش فقط جا می‌گرفت.
        */}
        {reading && (
          <dl className="grid gap-3 text-sm">
            <div className="grid gap-1">
              <dt className="text-xs text-muted-foreground">{t('نوع')}</dt>
              <dd>
                <Badge variant="outline" className="gap-1">
                  <KindIcon type={reading.type} />
                  {tr(KIND_LABEL[kindOf(reading.type)])}
                </Badge>
              </dd>
            </div>

            {/* ⚠️ بدنه اینجا کامل است — همان چیزی که در فهرست بریده می‌شد. */}
            {reading.body && (
              structuredBody(reading.type, reading.body)?.map((row) => (
                <div key={row.label} className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">{tr(row.label)}</dt>
                  <dd className="whitespace-pre-wrap">{row.value}</dd>
                </div>
              )) ?? (
                <div className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">{t('متن')}</dt>
                  <dd className="whitespace-pre-wrap">{reading.body}</dd>
                </div>
              )
            )}
          </dl>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setReading(null)}>{t("بستن")}</Button>
          {/* مقصد اختیاری است: اعلانِ بی‌آدرس هم باید خواندنی باشد. */}
          {reading?.url && (
            <Button asChild onClick={() => setReading(null)}>
              <Link href={reading.url}>{t("مشاهده")}</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
