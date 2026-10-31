'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Archive, FolderKanban, GitBranch, GitPullRequestArrow, Library, X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchInput } from '@/components/ui/search-input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/user-avatar';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDate } from '@/i18n/datetime';
import { cn } from '@/lib/utils';
import {
  CATEGORY_LABELS, LANGUAGE_LABELS, LIBRARY_CATEGORIES, LIBRARY_PLATFORMS, PLATFORM_LABELS,
} from '@/domain/library/model';
import type { EntryCard, ProjectOption } from '@/server/library/service';
import { CoverThumb, FreshBadge, KindIcon, PlatformBadge, StatusBadge, textDir, TopicChips, VersionLabel } from './entry-bits';

interface Filter {
  q: string;
  kind: string;
  platform: string;
  topic: string;
  projectId: number | null;
  mine: boolean;
  archived: boolean;
  review: boolean;
  category: string;
}

/**
 * فهرستِ کتابخانه — فیلترها در آدرس می‌نشینند تا پیوندِ «کدهای CMS ِ
 * Webflow» قابلِ فرستادن باشد و «برگشت» همان فهرست را برگرداند.
 */
export function LibraryView({
  entries,
  topics,
  projects,
  counts,
  categoryCounts,
  toReview,
  filter,
}: {
  entries: EntryCard[];
  topics: string[];
  projects: ProjectOption[];
  counts: { all: number; code: number; guide: number; note: number };
  /** شمارِ هر دسته با بقیهٔ فیلترها؛ کلیدِ `none` = بی‌دسته. */
  categoryCounts: Record<string, number>;
  /** موردهایی که پیشنهادِ باز دارند و بیننده بررسی‌شان می‌کند (۲.۴۶.۰). */
  toReview: number;
  filter: Filter;
}) {
  const tr = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filter.q);

  const go = (patch: Partial<Record<'q' | 'kind' | 'platform' | 'topic' | 'project' | 'mine' | 'archived' | 'review' | 'category', string>>) => {
    const next = new URLSearchParams();
    const merged = {
      q: filter.q, kind: filter.kind, platform: filter.platform, topic: filter.topic, category: filter.category,
      project: filter.projectId ? String(filter.projectId) : '',
      mine: filter.mine ? '1' : '', archived: filter.archived ? '1' : '', review: filter.review ? '1' : '',
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // جستجو با مکثِ کوتاه — هر حرف یک رفت‌وبرگشت نسازد.
  useEffect(() => {
    if (q === filter.q) return;
    const id = setTimeout(() => go({ q }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filtered = Boolean(
    filter.q || filter.platform || filter.topic || filter.projectId || filter.mine || filter.archived || filter.review
    || filter.category,
  );
  const categories = [
    ...LIBRARY_CATEGORIES.filter((c) => (categoryCounts[c] ?? 0) > 0 || filter.category === c)
      .map((c) => ({ key: c as string, label: tr(CATEGORY_LABELS[c]), count: categoryCounts[c] ?? 0 })),
    ...((categoryCounts.none ?? 0) > 0 ? [{ key: 'none', label: tr('بی‌دسته'), count: categoryCounts.none ?? 0 }] : []),
  ];
  /**
   * ⚠️ گروه‌بندی فقط وقتی کسی دنبالِ چیزِ خاصی نیست: در جستجو و فیلترِ دسته،
   * گروه فقط فاصله می‌اندازد.
   */
  const grouped = !filter.q && !filter.category && categories.length > 1;
  const groups = grouped
    ? [...LIBRARY_CATEGORIES, '' as const].map((c) => ({
      key: c || 'none',
      label: c ? tr(CATEGORY_LABELS[c]) : tr('بی‌دسته'),
      list: entries.filter((e) => e.category === c),
    })).filter((g) => g.list.length > 0)
    : [];
  const kinds = [
    { key: '', label: 'همه', count: counts.all },
    { key: 'code', label: 'کد', count: counts.code },
    { key: 'guide', label: 'راهنمای کارفرما', count: counts.guide },
    { key: 'note', label: 'آموزش و یادداشت', count: counts.note },
  ];

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto pb-1.5">
        <Tabs value={filter.kind} onValueChange={(v) => go({ kind: v })}>
          <TabsList className="w-max">
            {kinds.map((k) => (
              <TabsTrigger key={k.key || 'all'} value={k.key} className="flex-none px-3">
                {tr(k.label)}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground tabular-nums">
                  {k.count}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {categories.length > 1 && (
        <nav aria-label={tr('دسته‌ها')} className="-mt-1 flex gap-1.5 overflow-x-auto pb-1">
          <CategoryChip active={!filter.category} onClick={() => go({ category: '' })} label={tr('همهٔ دسته‌ها')} />
          {categories.map((c) => (
            <CategoryChip
              key={c.key}
              active={filter.category === c.key}
              onClick={() => go({ category: filter.category === c.key ? '' : c.key })}
              label={c.label}
              count={c.count}
            />
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr('جستجو در عنوان، توضیح و خودِ کد…')}
          containerClassName="sm:w-80"
        />
        <NativeSelect size="sm" value={filter.platform} onChange={(e) => go({ platform: e.target.value })} aria-label={tr('پلتفرم')}>
          <NativeSelectOption value="">{tr('همهٔ پلتفرم‌ها')}</NativeSelectOption>
          {LIBRARY_PLATFORMS.map((p) => (
            <NativeSelectOption key={p} value={p}>{tr(PLATFORM_LABELS[p])}</NativeSelectOption>
          ))}
        </NativeSelect>
        {topics.length > 0 && (
          <NativeSelect size="sm" value={filter.topic} onChange={(e) => go({ topic: e.target.value })} aria-label={tr('برچسب')}>
            <NativeSelectOption value="">{tr('همهٔ برچسب‌ها')}</NativeSelectOption>
            {topics.map((t) => <NativeSelectOption key={t} value={t}>#{t}</NativeSelectOption>)}
          </NativeSelect>
        )}
        {projects.length > 0 && (
          <NativeSelect
            size="sm"
            value={filter.projectId ? String(filter.projectId) : ''}
            onChange={(e) => go({ project: e.target.value })}
            aria-label={tr('پروژه')}
            containerClassName="max-w-56"
          >
            <NativeSelectOption value="">{tr('همهٔ پروژه‌ها')}</NativeSelectOption>
            {projects.map((p) => <NativeSelectOption key={p.id} value={String(p.id)}>{p.title}</NativeSelectOption>)}
          </NativeSelect>
        )}
        <Toggle
          size="sm"
          variant="outline"
          pressed={filter.mine}
          onPressedChange={(v) => go({ mine: v ? '1' : '' })}
        >
          {tr('نوشته‌های من')}
        </Toggle>
        {(toReview > 0 || filter.review) && (
          <Toggle
            size="sm"
            variant="outline"
            pressed={filter.review}
            onPressedChange={(v) => go({ review: v ? '1' : '' })}
          >
            <GitPullRequestArrow />
            {tr('پیشنهادهای منتظرِ من')}
            <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground tabular-nums">{toReview}</span>
          </Toggle>
        )}
        <Toggle
          size="sm"
          variant="outline"
          pressed={filter.archived}
          onPressedChange={(v) => go({ archived: v ? '1' : '' })}
        >
          <Archive />
          {tr('بایگانی')}
        </Toggle>
        {filtered && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setQ(''); go({ q: '', platform: '', topic: '', project: '', mine: '', archived: '', review: '', category: '' }); }}
          >
            <X />
            {tr('پاک کردنِ فیلترها')}
          </Button>
        )}
        {pending && <Spinner className="ms-auto" />}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<Library />}
          title={filtered || filter.kind ? tr('چیزی پیدا نشد') : tr('کتابخانه هنوز خالی است')}
          description={filtered || filter.kind
            ? tr('فیلترها را کم کنید یا عبارتِ دیگری جستجو کنید.')
            : tr('اولین کدِ اختصاصی یا راهنما را ثبت کنید تا نفرِ بعدی دوباره ننویسدش.')}
        >
          {!filtered && !filter.kind && (
            <Button asChild><Link href="/library/new">{tr('ثبتِ موردِ تازه')}</Link></Button>
          )}
        </EmptyState>
      ) : grouped ? (
        <div className="grid gap-6">
          {groups.map((g) => (
            <section key={g.key} className="grid gap-2.5" aria-labelledby={`lib-cat-${g.key}`}>
              <h2 id={`lib-cat-${g.key}`} className="flex items-center gap-2 text-sm font-bold">
                {g.label}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal leading-none text-muted-foreground tabular-nums">
                  {g.list.length}
                </span>
              </h2>
              <div className="grid gap-3 @2xl/main:grid-cols-2 @6xl/main:grid-cols-3">
                {g.list.map((e) => <EntryCardView key={e.id} entry={e} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 @2xl/main:grid-cols-2 @6xl/main:grid-cols-3">
          {entries.map((e) => <EntryCardView key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary/40',
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{count}</span>
      )}
    </button>
  );
}

function EntryCardView({ entry }: { entry: EntryCard }) {
  const tr = useT();
  const tz = useTimeZone();
  return (
    <Link
      href={`/library/${entry.id}`}
      className="group grid content-start overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/40"
    >
      {entry.coverFileId !== null && (
        <CoverThumb fileId={entry.coverFileId} kind={entry.kind} className="aspect-[16/9] w-full border-b bg-muted" />
      )}
      <div className="grid content-start gap-3 p-4">
      <div className="flex items-start gap-3">
        {entry.coverFileId === null && <KindIcon kind={entry.kind} />}
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-semibold group-hover:text-primary" dir="auto">{entry.title}</h3>
            <VersionLabel label={entry.versionLabel} />
            <StatusBadge status={entry.status} />
            <FreshBadge createdAt={entry.createdAt} updatedAt={entry.updatedAt} changeNote={entry.changeNote} />
            {entry.supersededById && <span className="text-xs text-muted-foreground">({tr('نسخهٔ قدیمی')})</span>}
            {entry.archived && <span className="text-xs text-muted-foreground">({tr('بایگانی')})</span>}
          </div>
          {entry.summary && <p className="line-clamp-2 text-[13px] text-muted-foreground" dir={textDir(entry.summary)}>{entry.summary}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <PlatformBadge platform={entry.platform} />
        {entry.languages.map((l) => (
          <span key={l} className="rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" dir="ltr">
            {LANGUAGE_LABELS[l]}
          </span>
        ))}
        {entry.clientVisible && <span className="text-[11px] text-emerald-700 dark:text-emerald-300">{tr('کارفرما می‌بیند')}</span>}
        {entry.pendingSuggestions > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
            <GitPullRequestArrow className="size-3" aria-hidden />
            {tr('{n} پیشنهادِ ویرایش', { n: entry.pendingSuggestions })}
          </span>
        )}
        {entry.olderVersions > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <GitBranch className="size-3" aria-hidden />
            {tr('{n} نسخهٔ قبلی', { n: entry.olderVersions })}
          </span>
        )}
      </div>
      <TopicChips topics={entry.topics} />
      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          {entry.authorId && <UserAvatar userId={entry.authorId} name={entry.authorName ?? ''} size="xs" presence={false} />}
          <span className="truncate">{entry.authorName ?? tr('نامشخص')}</span>
          <span>·</span>
          <span className="num">{formatDate(entry.updatedAt, tz)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <FolderKanban className="size-3.5" aria-hidden />
          {entry.installs === 0 ? tr('روی پروژه‌ای نیست') : tr('{n} پروژه', { n: entry.installs })}
        </span>
      </div>
      </div>
    </Link>
  );
}
