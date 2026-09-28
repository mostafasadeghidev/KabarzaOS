import { TagChip } from '@/components/ui/tag-chip';

/**
 * چیپِ وضعیتِ پروژه.
 *
 * ⚠️ رنگ از **خودِ تگِ وضعیت** می‌آید (همان رنگی که مدیر در تنظیمات انتخاب
 * کرده)، ولی فقط به شکلِ نقطه روی چیپِ خنثی (DESIGN.md §۲): بجِ توپر به رنگِ
 * تگ، کنارِ چند چیپِ دیگر، صفحه را رنگارنگ و شلوغ می‌کرد. تگِ بی‌رنگ به رنگِ
 * گروهِ وضعیت برمی‌گردد تا نمای پیش‌فرض هم معنا داشته باشد (R-PROJ-16).
 */
const DOT_BY_GROUP: Record<string, string> = {
  not_started: 'var(--color-muted-foreground)',
  lead: 'var(--color-warning)',
  in_progress: 'var(--color-primary)',
  completed: 'var(--color-success)',
  on_hold: 'var(--color-muted-foreground)',
  cancelled: 'var(--color-destructive)',
};

export function ProjectStatus({
  name, group, color = null,
}: {
  name: string | null;
  group: string | null;
  /** رنگِ تگِ وضعیت؛ نبودنش یعنی رنگِ گروه. */
  color?: string | null;
}) {
  if (!name) return <span className="text-sm text-muted-foreground">—</span>;
  return <TagChip color={color || DOT_BY_GROUP[group ?? '']}>{name}</TagChip>;
}
