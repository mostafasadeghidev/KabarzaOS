'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { matchesTab, type TabInfo, type TabKey } from '@/domain/projects/tabs';
import type { ProjectListRow } from '@/server/projects/repository';
import { ProjectCard } from './project-card';
import type { StatusOption } from './status-picker';
import type { CardOptions } from './card-quick-add';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/client';

/**
 * شبکهٔ کارتِ پروژه‌ها با تب و جستجو.
 *
 * تب‌ها روی سرور شمرده می‌شوند (منبعِ حقیقتِ واحد) ولی جابه‌جایی و جستجو
 * سمتِ کلاینت است تا فوری باشد — همان رفتارِ نسخهٔ قبلی.
 */
export function ProjectGrid({
  projects,
  tabs,
  initialTab,
  today,
  statuses,
  cardOptions,
}: {
  projects: ProjectListRow[];
  tabs: TabInfo[];
  initialTab: TabKey;
  /** تاریخِ امروز از **سرور** — تا نوارِ ددلاین در هیدریشن نپرد. */
  today: string;
  statuses: StatusOption[];
  cardOptions: CardOptions | null;
}) {
  const tr = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => matchesTab(tab, p))
      .filter((p) => (q ? p.title.toLowerCase().includes(q) : true));
  }, [projects, tab, query]);

  /** نتیجه‌های جستجو در تب‌های دیگر — تا کاربر گم نشود. */
  const otherHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    return projects.filter((p) => !matchesTab(tab, p) && p.title.toLowerCase().includes(q)).length;
  }, [projects, tab, query]);

  const selectTab = (key: TabKey) => {
    setTab(key);
    // تب در URL می‌ماند تا رفرش و لینکِ مستقیم کار کند.
    const next = new URLSearchParams(params.toString());
    next.set('tab', key);
    router.replace(`/projects?${next.toString()}`, { scroll: false });
  };

  return (
    <>
      <nav className="flex flex-wrap gap-1 border-b pb-2">
        {tabs.filter((t) => !t.hidden || t.key === tab).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              t.key === tab ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            {tr(t.label)}
            <Badge variant="secondary" className="num px-1.5 py-0 text-[10px]">{t.count}</Badge>
          </button>
        ))}
      </nav>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr("جستجوی نام پروژه…")}
          className="ps-9"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={query ? 'نتیجه‌ای نیست' : 'پروژه‌ای در این دسته نیست'}
          description={
            otherHits > 0
              ? tr('{n} نتیجه در تب‌های دیگر پیدا شد.', { n: otherHits })
              : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-3 @2xl/main:grid-cols-2 @5xl/main:grid-cols-3">
            {visible.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                today={today}
                statuses={statuses}
                cardOptions={cardOptions}
              />
            ))}
          </div>
          {otherHits > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="num">{otherHits}</span>
              {tr("نتیجهٔ دیگر در تب‌های دیگر هست.")}
            </p>
          )}
        </>
      )}
    </>
  );
}
