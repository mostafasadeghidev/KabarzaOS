'use client';

import { BookOpenText, Code2, Lightbulb, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import { Hint } from '@/components/ui/tooltip';
import {
  CATEGORY_LABELS, freshness, KIND_LABELS, PLATFORM_LABELS, STATUS_LABELS, STATUS_TONE,
  type LibraryCategory, type LibraryKind, type LibraryPlatform, type LibraryStatus,
} from '@/domain/library/model';

/** تکه‌های کوچکِ مشترکِ فهرست، صفحهٔ مورد و تبِ پروژه — یک ظاهر همه‌جا. */

const KIND_ICON = { code: Code2, guide: BookOpenText, note: Lightbulb } as const;

/** رنگِ هر نوع — ملایم، هم‌خانوادهٔ نشان‌های اپ. */
const KIND_TONE: Record<LibraryKind, string> = {
  code: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  guide: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  note: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

export function KindIcon({ kind, className }: { kind: LibraryKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', KIND_TONE[kind], className)}>
      <Icon className="size-4.5" aria-hidden />
    </span>
  );
}

export function KindBadge({ kind }: { kind: LibraryKind }) {
  const tr = useT();
  const Icon = KIND_ICON[kind];
  return (
    <Badge variant="outline" className={cn('border-transparent', KIND_TONE[kind])}>
      <Icon aria-hidden />
      {tr(KIND_LABELS[kind])}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: LibraryStatus }) {
  const tr = useT();
  // «آماده» حالتِ عادی است و نشانی نمی‌خواهد؛ فقط استثنا دیده شود.
  if (status === 'ready') return null;
  return <Badge variant={STATUS_TONE[status]}>{tr(STATUS_LABELS[status])}</Badge>;
}

export function PlatformBadge({ platform }: { platform: LibraryPlatform }) {
  const tr = useT();
  return <Badge variant="outline">{tr(PLATFORM_LABELS[platform])}</Badge>;
}

export function TopicChips({ topics, className }: { topics: readonly string[]; className?: string }) {
  if (topics.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {topics.map((t) => (
        <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground" dir="auto">
          #{t}
        </span>
      ))}
    </div>
  );
}

/**
 * جهتِ یک متنِ نوشته‌شده توسطِ تیم.
 * ⚠️ `dir="auto"` از اولین حرفِ قوی پیروی می‌کند: «Publish کنید و …» چپ‌به‌راست
 * می‌شد و جمله وارونه خوانده می‌شد. هر متنی که حرفِ فارسی/عربی دارد راست‌به‌چپ است.
 */
export function textDir(text: string): 'rtl' | 'ltr' {
  return /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr';
}

export function CategoryBadge({ category }: { category: LibraryCategory | '' }) {
  const tr = useT();
  if (!category) return null;
  return <Badge variant="secondary">{tr(CATEGORY_LABELS[category])}</Badge>;
}

/** «v3.0» کنارِ عنوان. */
export function VersionLabel({ label, className }: { label?: string; className?: string }) {
  if (!label) return null;
  return (
    <span className={cn('rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground', className)} dir="ltr">
      {label}
    </span>
  );
}

/**
 * «تازه» یا «به‌روز شد» (۲.۴۷.۰) — با «چه چیزی عوض شد» در راهنمای شناور.
 * ⚠️ زمانِ «اکنون» از مرورگر است؛ روی سرور هم همان ساعت ساخته می‌شود و فرقِ
 * چند ثانیه نشان را عوض نمی‌کند.
 */
export function FreshBadge({ createdAt, updatedAt, changeNote }: { createdAt: Date; updatedAt: Date; changeNote?: string }) {
  const tr = useT();
  const state = freshness(new Date(createdAt), new Date(updatedAt));
  if (!state) return null;
  const badge = (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium leading-none text-primary">
      <Sparkles className="size-3" aria-hidden />
      {state === 'new' ? tr('تازه') : tr('به‌روز شد')}
    </span>
  );
  return state === 'updated' && changeNote ? <Hint label={changeNote}>{badge}</Hint> : badge;
}

/** تصویرِ شاخص یا نشانِ نوع — بالای کارتِ فهرست. */
export function CoverThumb({ fileId, kind, className }: { fileId: number | null; kind: LibraryKind; className?: string }) {
  if (fileId === null) {
    const Icon = KIND_ICON[kind];
    return (
      <div className={cn('flex items-center justify-center', KIND_TONE[kind], className)}>
        <Icon className="size-7 opacity-70" aria-hidden />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- مسیرِ گیت‌شدهٔ فایل، نه تصویرِ ایستا
    <img src={`/api/files/${fileId}?thumb`} alt="" loading="lazy" className={cn('object-cover', className)} />
  );
}
