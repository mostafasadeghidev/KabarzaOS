import { Badge } from '@/components/ui/badge';

/**
 * چیپِ وضعیتِ پروژه.
 * R-PROJ-16 — رنگ از **گروهِ وضعیت** می‌آید، نه از نامِ قابلِ تغییرِ آن.
 */
const VARIANT_BY_GROUP: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'outline'> = {
  not_started: 'secondary',
  lead: 'warning',
  in_progress: 'default',
  completed: 'success',
  on_hold: 'secondary',
  cancelled: 'outline',
};

export function ProjectStatus({ name, group }: { name: string | null; group: string | null }) {
  if (!name) return <span className="text-sm text-muted-foreground">—</span>;
  return <Badge variant={VARIANT_BY_GROUP[group ?? ''] ?? 'secondary'}>{name}</Badge>;
}
