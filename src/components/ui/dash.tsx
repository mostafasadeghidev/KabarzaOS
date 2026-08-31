import Link from 'next/link';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { t } from '@/i18n/server';

/**
 * بلوک‌های داشبورد — ساختارِ بصری از `dashboard-01`ِ رسمیِ shadcn،
 * محتوا و چیدمانِ منطقی از نسخهٔ قبلیِ K-Team.
 */

/** کارتِ آماریِ بزرگ — عنوان کوچک، عددِ درشت، بجِ روند، پانوشت. */
export function MetricCard({
  label,
  value,
  trend,
  headline,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  /** تغییر نسبت به دورهٔ قبل. undefined = بدونِ روند. */
  trend?: number;
  headline?: string;
  hint?: string;
  href?: string | null;
}) {
  const dir = trend === undefined ? null : trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat';
  const TrendIcon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;

  const card = (
    <Card className="@container/card h-full bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="num text-2xl font-semibold @[250px]/card:text-3xl">{value}</CardTitle>
        {dir && (
          <CardAction>
            <Badge variant="outline" className="gap-1">
              <TrendIcon className="size-3" />
              <span className="num">{trend! > 0 ? `+${trend}` : trend}</span>
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      {(headline || hint) && (
        <CardFooter className="flex-col items-start gap-1 text-sm">
          {headline && (
            <div className="line-clamp-1 flex items-center gap-1.5 font-medium">
              {headline}
              {dir && <TrendIcon className="size-3.5" />}
            </div>
          )}
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </CardFooter>
      )}
    </Card>
  );

  if (!href) return <div className="h-full opacity-90">{card}</div>;
  return (
    <Link href={href} className="block h-full transition-opacity hover:opacity-90">
      {card}
    </Link>
  );
}

/** کارتِ فشرده برای گروه‌های «منتظرِ اقدام» — عدد + برچسب. */
export function CompactCard({
  value,
  label,
  href,
}: {
  value: number;
  label: string;
  href?: string | null;
}) {
  const body = (
    <>
      <span className="num text-xl font-semibold leading-none">{value}</span>
      <span className="mt-1.5 text-xs leading-snug text-muted-foreground">{label}</span>
    </>
  );
  const base = 'flex min-w-30 flex-1 flex-col rounded-[--radius] border bg-card p-3 shadow-xs';
  if (!href) return <div className={cn(base, 'opacity-60')}>{body}</div>;
  return <Link href={href} className={cn(base, 'transition-colors hover:bg-muted/50')}>{body}</Link>;
}

export function DashHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-muted-foreground">{children}</h2>;
}

/** گروهِ کارت‌ها با عنوانِ کوچک — مثلِ `. نسخهٔ قبلی. */
export function CardGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[--radius] border bg-muted/30 p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** پنل — عنوان + محتوا، مثلِ `. نسخهٔ قبلی. */
export function DashPanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0 shadow-xs">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action && (
          <Link href={action.href} className="text-xs text-muted-foreground hover:text-foreground">
            {t(action.label)}
          </Link>
        )}
      </header>
      <div className="p-4">{children}</div>
    </Card>
  );
}

/** فهرستِ ریسک — نامِ پروژه + بجِ وضعیت. */
export function RiskList({
  items,
  empty,
  tone = 'muted',
}: {
  items: Array<{ id: number; title: string; badge: string }>;
  empty: string;
  tone?: 'muted' | 'danger' | 'warning';
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
          <Link href={`/projects/${item.id}`} className="truncate font-medium hover:underline">
            {item.title}
          </Link>
          <span
            className={cn(
              'shrink-0 text-xs',
              tone === 'danger' && 'text-destructive',
              tone === 'warning' && 'text-warning',
              tone === 'muted' && 'text-muted-foreground',
            )}
          >
            {item.badge}
          </span>
        </li>
      ))}
    </ul>
  );
}
