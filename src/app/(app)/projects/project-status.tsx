import { Badge } from '@/components/ui/badge';
import { chipStyle } from '@/domain/ui/contrast';

/**
 * چیپِ وضعیتِ پروژه.
 *
 * ⚠️ رنگ از **خودِ تگِ وضعیت** می‌آید (همان رنگی که مدیر در تنظیمات انتخاب
 * کرده)، و متنش با قاعدهٔ کنتراست سیاه یا سفید می‌شود — نه همیشه سفید، که
 * روی تگِ روشن ناخوانا بود. تگِ بی‌رنگ به رنگِ گروهِ وضعیت برمی‌گردد تا
 * نمای پیش‌فرض هم معنا داشته باشد (R-PROJ-16).
 */
const VARIANT_BY_GROUP: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'outline'> = {
  not_started: 'secondary',
  lead: 'warning',
  in_progress: 'default',
  completed: 'success',
  on_hold: 'secondary',
  cancelled: 'outline',
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
  const style = chipStyle(color);
  return (
    <Badge variant={style ? 'outline' : (VARIANT_BY_GROUP[group ?? ''] ?? 'secondary')} style={style}>
      {name}
    </Badge>
  );
}
