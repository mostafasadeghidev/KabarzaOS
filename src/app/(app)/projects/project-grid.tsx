'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  buildTabs, matchesTab, otherHitsTarget, RELATION_LABELS, relationCounts, type RelationKey, type TabInfo, type TabKey,
} from '@/domain/projects/tabs';
import type { VisibleProjectRow } from '@/server/projects/service';
import { ProjectCard } from './project-card';
import type { StatusOption } from './status-picker';
import type { CardOptions } from './card-quick-add';
import { cn } from '@/lib/utils';
import { CardPager, useCardPage } from '@/components/ui/card-pager';
import { useT } from '@/i18n/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-shell';
import { SearchInput } from '@/components/ui/search-input';

/**
 * شبکهٔ کارتِ پروژه‌ها با تب و جستجو.
 *
 * تب‌ها روی سرور شمرده می‌شوند (منبعِ حقیقتِ واحد) ولی جابه‌جایی و جستجو
 * سمتِ کلاینت است تا فوری باشد — همان رفتارِ نسخهٔ قبلی.
 */
export function ProjectGrid({
  header,
  projects,
  tabs,
  initialTab,
  today,
  statuses,
  cardOptions,
}: {
  /**
   * سرصفحهٔ صفحه — اینجا کشیده می‌شود چون جستجو (state ِ همین کامپوننت)
   * کنارِ دکمهٔ اصلی در سرصفحه می‌نشیند.
   */
  header: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode };
  projects: VisibleProjectRow[];
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

  /**
   * بخشِ رابطه — فقط وقتی بیننده بیش از یک رابطه دارد (عضو + کارفرما، یا
   * عضو + مدیرِ دفتر). با یک رابطه، فیلتر چیزی را جدا نمی‌کند و فقط شلوغی است.
   */
  const relations = useMemo(() => relationCounts(projects), [projects]);
  const requestedRel = params.get('rel') as RelationKey | null;
  const [relation, setRelation] = useState<RelationKey | 'all'>(
    requestedRel && relations.some((r) => r.key === requestedRel) ? requestedRel : 'all',
  );
  const scoped = useMemo(
    () => (relation === 'all' ? projects : projects.filter((p) => p.relations?.includes(relation))),
    [projects, relation],
  );
  // ⚠️ شمارِ تب‌های وضعیت درونِ همان بخش — شمارِ سرور برای کلِ فهرست است.
  const shownTabs = useMemo(
    () => (relation === 'all' ? tabs : buildTabs(scoped, tab)),
    [relation, tabs, scoped, tab],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((p) => matchesTab(tab, p))
      .filter((p) => (q ? p.title.toLowerCase().includes(q) : true));
  }, [scoped, tab, query]);

  // ⚠️ کوئریِ پروژه‌ها `LIMIT` ندارد؛ بریدن اینجا اتفاق می‌افتد.
  const pager = useCardPage(visible);

  /** نتیجه‌های جستجو در تب‌های دیگر — تا کاربر گم نشود. */
  const otherMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return scoped.filter((p) => !matchesTab(tab, p) && p.title.toLowerCase().includes(q));
  }, [scoped, tab, query]);
  const otherTarget = otherHitsTarget(tab, otherMatches);

  const selectRelation = (key: RelationKey | 'all') => {
    setRelation(key);
    const next = new URLSearchParams(params.toString());
    if (key === 'all') next.delete('rel');
    else next.set('rel', key);
    router.replace(`/projects?${next.toString()}`, { scroll: false });
  };

  const selectTab = (key: TabKey) => {
    setTab(key);
    // تب در URL می‌ماند تا رفرش و لینکِ مستقیم کار کند.
    const next = new URLSearchParams(params.toString());
    next.set('tab', key);
    router.replace(`/projects?${next.toString()}`, { scroll: false });
  };

  return (
    <>
      {/*
        ⚠️ جستجو کنارِ دکمهٔ اصلی در سرصفحه، نه زیرِ تب‌ها: پیش از این تنها و
        بی‌قرینه زیرِ نوارِ تب می‌نشست — و تب‌های وضعیت آن‌قدر زیادند که کنارِ
        هم در یک ردیف جا نمی‌شوند.
      */}
      <PageHeader
        title={header.title}
        description={header.description}
        actions={(
          <>
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("جستجوی نام پروژه…")}
            />
            {header.actions}
          </>
        )}
      />

      {relations.length > 1 && (
        <div className="overflow-x-auto overflow-y-hidden">
          <Tabs value={relation} onValueChange={(v) => selectRelation(v as typeof relation)}>
            <TabsList variant="line" className="w-max">
              <TabsTrigger value="all" className="flex-none">{tr('همه')}</TabsTrigger>
              {relations.map((r) => (
                <TabsTrigger key={r.key} value={r.key} className="flex-none">
                  {tr(RELATION_LABELS[r.key])}
                  <span className="num text-xs text-muted-foreground">{r.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* shadcn Tabs — روی صفحهٔ باریک پیمایشِ افقی، به‌جای شکستنِ خط. */}
      <div className="overflow-x-auto overflow-y-hidden">
        <Tabs value={tab} onValueChange={(v) => selectTab(v as typeof tab)}>
          <TabsList className="w-max">
            {shownTabs.filter((t) => !t.hidden || t.key === tab).map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="flex-none px-3">
                {tr(t.label)}
                <Badge variant="secondary" className="num px-1.5 py-0 text-[10px]">{t.count}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={query ? tr('نتیجه‌ای نیست') : tr('پروژه‌ای در این دسته نیست')}
        >
          {otherTarget && (
            <OtherHits matches={otherMatches} onJump={() => selectTab(otherTarget)} />
          )}
        </EmptyState>
      ) : (
        <>
          {/*
            ⚠️ `gap-y` صفر است و فاصلهٔ عمودیِ کارت‌ها `mb-3` ِ خودِ کارت: کارت‌ها
            subgrid‌اند و gap ِ ردیفِ شبکه میانِ ردیف‌های **درونِ** کارت هم می‌نشست
            (← project-card). `-mb-3` فاصلهٔ اضافهٔ زیرِ آخرین ردیفِ کارت‌ها را
            جبران می‌کند.
          */}
          <div className="-mb-3 grid gap-x-3 @2xl/main:grid-cols-2 @5xl/main:grid-cols-3">
            {pager.slice.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                today={today}
                statuses={statuses}
                cardOptions={cardOptions}
              />
            ))}
          </div>
          <CardPager {...pager} />
          {otherTarget && (
            <OtherHits matches={otherMatches} onJump={() => selectTab(otherTarget)} />
          )}
        </>
      )}
    </>
  );
}

/** پیش‌نمایشِ تا ۸ نام + دکمهٔ پرش — کاربر می‌بیند پروژه‌اش آنجاست، بعد می‌رود. */
const OTHER_PREVIEW = 8;

function OtherHits({ matches, onJump }: {
  matches: VisibleProjectRow[];
  onJump: () => void;
}) {
  const tr = useT();
  const names = matches.slice(0, OTHER_PREVIEW).map((p) => p.title);
  const rest = matches.length - names.length;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Button type="button" size="sm" variant="outline" onClick={onJump}>
        {tr('نمایش {n} نتیجه در تب‌های دیگر', { n: matches.length })}
      </Button>
      <p className="text-xs text-muted-foreground">
        {names.join('، ')}
        {rest > 0 && ` ${tr('و {n} مورد دیگر', { n: rest })}`}
      </p>
    </div>
  );
}
