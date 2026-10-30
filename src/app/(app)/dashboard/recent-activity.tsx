'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/user-avatar';
import { useLocale, useT, useTimeZone } from '@/i18n/client';
import { intlTag } from '@/i18n/config';

export interface RecentEvent {
  id: number;
  /** کلیدِ ترجمهٔ عمل — «ثبتِ ساعت». */
  label: string;
  actorId: number | null;
  actorName: string | null;
  /** ISO — روز و ساعت در منطقهٔ زمانیِ **بیننده** ساخته می‌شوند. */
  at: string;
  /** موردِ رویداد («طراحی سایت») و پروژهٔ مادرش، اگر معلوم است. */
  subject: string | null;
  project: string | null;
}

/**
 * «آخرین رویدادها» ِ داشبورد (۲.۴۴.۲).
 *
 * ⚠️ پیش از این هر ردیف «عمل · نام … روزِ هفته ساعت» بود: نام وسطِ جمله، روزِ
 * هفته روی هر ردیف تکرار، و معلوم نبود کارِ روی کدام پروژه است. حالا رویدادها
 * زیرِ سرِ روز («امروز»، «دیروز»، «چهارشنبه») گروه می‌شوند و هر ردیف: آواتار،
 * نام و عمل، و زیرش مورد/پروژه؛ ساعت تنها در انتها.
 *
 * ⚠️ سمتِ مرورگر عمداً: روز و ساعت پیش از این در منطقهٔ زمانیِ **سرور** نوشته
 * می‌شد، نه کاربر.
 */
export function RecentActivity({ events, actorHref }: {
  events: RecentEvent[];
  /** پیوندِ نام به گزارشِ عضو — فقط برای کسی که گزارش‌ها را می‌بیند. */
  actorHref: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const timeZone = useTimeZone() || undefined;
  const tag = intlTag(locale);

  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Intl.DateTimeFormat(tag, { timeZone, hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' });
  const weekday = new Intl.DateTimeFormat(tag, { timeZone, weekday: 'long' });
  const date = new Intl.DateTimeFormat(tag, { timeZone, day: 'numeric', month: 'short' });

  const today = dayKey.format(new Date());
  const yesterday = dayKey.format(new Date(Date.now() - 86_400_000));
  const dayTitle = (d: Date) => {
    const k = dayKey.format(d);
    if (k === today) return t('امروز');
    if (k === yesterday) return t('دیروز');
    return `${weekday.format(d)} · ${date.format(d)}`;
  };

  const groups: Array<{ key: string; title: string; items: RecentEvent[] }> = [];
  for (const e of events) {
    const d = new Date(e.at);
    const key = dayKey.format(d);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, title: dayTitle(d), items: [e] });
  }

  return (
    <div className="grid gap-3">
      {groups.map((g) => (
        <section key={g.key} className="grid gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">{g.title}</h4>
          <ul className="grid">
            {g.items.map((e) => {
              const where = [e.subject, e.project && e.project !== e.subject ? e.project : null].filter(Boolean).join(' · ');
              const name = e.actorName ?? t('سامانه');
              return (
                <li key={e.id} className="flex items-center gap-2.5 rounded-md py-1.5">
                  <UserAvatar userId={e.actorId} name={name} size="md" presence={false} />
                  <div className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-sm">
                      {actorHref && e.actorId ? (
                        <Link href={`/reports/member/${e.actorId}`} className="font-medium hover:underline">{name}</Link>
                      ) : (
                        <span className="font-medium">{name}</span>
                      )}
                      <span className="text-muted-foreground"> {t(e.label)}</span>
                    </span>
                    {where && <span className="truncate text-xs text-muted-foreground">{where}</span>}
                  </div>
                  <time dateTime={e.at} className="num shrink-0 self-start pt-0.5 text-xs text-muted-foreground">
                    {time.format(new Date(e.at))}
                  </time>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
