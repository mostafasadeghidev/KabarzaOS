'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import type { MemberHours, StatusSlice, WeeklyPoint } from '@/server/dashboard';
import { useT } from '@/i18n/client';

/**
 * نمودارهای داشبورد — سه نمودارِ نسخهٔ قبلی با کامپوننتِ رسمیِ shadcn/recharts.
 *
 * ⚠️ RTL: recharts محورها را چپ‌به‌راست می‌چیند. برای فارسی
 * `reversed` روی محورِ X و `orientation="right"` روی محورِ Y گذاشته می‌شود.
 *
 * ⚠️ و سطحِ نمودار (`.recharts-surface`) صریحاً LTR می‌ماند: recharts مختصاتِ متنِ محور را با
 * `textAnchor="start"` می‌دهد و در جریانِ RTL این یعنی «از این نقطه به
 * **چپ** بنویس» — یعنی برچسبِ محور از ستونِ خودش بیرون می‌زد و روی میله‌ها
 * می‌افتاد (نامِ عضو و وضعیتِ پروژه ناخوانا می‌شدند). با dir=ltr لنگرها
 * درست تفسیر می‌شوند و خودِ متنِ فارسی همچنان راست‌به‌چپ رندر می‌شود. فقط
 * سطحِ SVG، نه کلِ ظرف — تولتیپ باید RTL بماند.
 */


/**
 * ⚠️ برچسبِ محورها با توکنِ تم، نه پیش‌فرضِ کتابخانه.
 *
 * recharts برچسب‌ها را با `rgb(102,102,102)` ِ ثابت می‌کشد. روی پنلِ تیره
 * نسبتِ کنتراستش حدودِ ۳:۱ است — زیرِ حداقلِ ۴٫۵:۱ برای متنِ ۱۱ پیکسلی، و
 * عملاً ناخوانا. `--color-muted-foreground` در هر دو حالت و هر شش پالت
 * درست است، چون خودش با تم عوض می‌شود.
 */
const TICK = { fill: 'var(--color-muted-foreground)', fontSize: 11 };
const GRID = 'var(--color-border)';

/**
 * ⚠️ برچسب داخلِ کامپوننت ساخته می‌شود، نه در سطحِ ماژول: ثابتِ ماژولی یک بار
 * و پیش از معلوم‌شدنِ زبانِ کاربر ارزیابی می‌شود، پس در راهنمای نمودار برای
 * همه فارسی می‌ماند.
 */
function useHoursConfig(): ChartConfig {
  const t = useT();
  return { hours: { label: t('ساعت'), color: 'var(--color-primary)' } };
}

function useCountConfig(): ChartConfig {
  const t = useT();
  return { count: { label: t('پروژه'), color: 'var(--color-primary)' } };
}

/** روندِ هفتگیِ ساعتِ تیم — شش پنجرهٔ ۷روزه. */
export function WeeklyTrendChart({ data }: { data: WeeklyPoint[] }) {
  const hoursConfig = useHoursConfig();
  return (
    <ChartContainer config={hoursConfig} className="aspect-auto h-56 w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillHours" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-hours)" stopOpacity={0.7} />
            <stop offset="95%" stopColor="var(--color-hours)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="label" reversed tickLine={false} axisLine={false} tickMargin={8} tick={TICK} />
        <YAxis orientation="right" tickLine={false} axisLine={false} width={34} tick={TICK} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Area
          dataKey="hours"
          type="monotone"
          fill="url(#fillHours)"
          stroke="var(--color-hours)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/** ساعتِ کاریِ اعضا در ۳۰ روزِ گذشته — میلهٔ افقی. */
export function MemberHoursChart({ data }: { data: MemberHours[] }) {
  const hoursConfig = useHoursConfig();
  return (
    <ChartContainer config={hoursConfig} className="aspect-auto h-56 w-full [&_.recharts-surface]:[direction:ltr]">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={GRID} />
        <XAxis type="number" reversed tickLine={false} axisLine={false} tick={TICK} />
        <YAxis
          type="category"
          dataKey="name"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={90}
          tick={TICK}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="hours" fill="var(--color-hours)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

/** توزیعِ وضعیتِ پروژه‌ها. */
export function StatusChart({ data }: { data: StatusSlice[] }) {
  const countConfig = useCountConfig();
  return (
    <ChartContainer config={countConfig} className="aspect-auto h-56 w-full [&_.recharts-surface]:[direction:ltr]">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={GRID} />
        <XAxis type="number" reversed tickLine={false} axisLine={false} allowDecimals={false} tick={TICK} />
        <YAxis
          type="category"
          dataKey="status"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={110}
          // ⚠️ فاصله از میله: بدونِ آن برچسب ۸ پیکسل با انتهای میله فاصله
          // داشت و روی داده‌های پرتر عملاً به آن می‌چسبید.
          tickMargin={8}
          tick={TICK}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
