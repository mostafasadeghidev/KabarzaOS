'use client';

import { BookOpenText, Code2, Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import {
  KIND_LABELS, PLATFORM_LABELS, STATUS_LABELS, STATUS_TONE,
  type LibraryKind, type LibraryPlatform, type LibraryStatus,
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
