'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import type { MemberHours, StatusSlice, WeeklyPoint } from '@/server/dashboard';

/**
 * نمودارهای داشبورد — سه نمودارِ نسخهٔ قبلی با کامپوننتِ رسمیِ shadcn/recharts.
 *
 * ⚠️ RTL: recharts محورها را چپ‌به‌راست می‌چیند. برای فارسی
 * `reversed` روی محورِ X و `orientation="right"` روی محورِ Y گذاشته می‌شود.
 */

const hoursConfig = {
  hours: { label: 'ساعت', color: 'var(--color-primary)' },
} satisfies ChartConfig;

const countConfig = {
  count: { label: 'پروژه', color: 'var(--color-primary)' },
} satisfies ChartConfig;

/** روندِ هفتگیِ ساعتِ تیم — شش پنجرهٔ ۷روزه. */
export function WeeklyTrendChart({ data }: { data: WeeklyPoint[] }) {
  return (
    <ChartContainer config={hoursConfig} className="aspect-auto h-56 w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillHours" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-hours)" stopOpacity={0.7} />
            <stop offset="95%" stopColor="var(--color-hours)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" reversed tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis orientation="right" tickLine={false} axisLine={false} width={34} fontSize={11} />
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
  return (
    <ChartContainer config={hoursConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" reversed tickLine={false} axisLine={false} fontSize={11} />
        <YAxis
          type="category"
          dataKey="name"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={90}
          fontSize={11}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="hours" fill="var(--color-hours)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

/** توزیعِ وضعیتِ پروژه‌ها. */
export function StatusChart({ data }: { data: StatusSlice[] }) {
  return (
    <ChartContainer config={countConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" reversed tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} />
        <YAxis
          type="category"
          dataKey="status"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={100}
          fontSize={11}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
