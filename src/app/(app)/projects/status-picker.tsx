'use client';

import { useState, useTransition } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { setStatusAction } from './_form/card-actions';
import { ProjectStatus } from './project-status';
import { PROJECT_STATUS_GROUPS, groupLabels } from '@/domain/tags/groups';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n/client';

export interface StatusOption {
  id: number;
  name: string;
  group: string | null;
  color: string | null;
}

/**
 * برچسبِ گروه‌ها — `Tags::project_status_groups()`.
 *
 * ⚠️ از دامنه می‌آید، نه رونوشتِ محلی: رونوشتِ قبلی اینجا از افزونه فاصله
 * گرفته بود («متوقف» به‌جای «نگه‌داشته‌شده»، «لغوشده» به‌جای «کنسل‌شده») و
 * چون فرمِ تگ برچسبِ درست را نشان می‌داد، یک گروه دو نامِ متفاوت داشت.
 */
const GROUP_LABEL = groupLabels(PROJECT_STATUS_GROUPS);

/**
 * چیپِ وضعیت که خودش دکمهٔ تغییر است — `status_dropdown_html()`.
 *
 * ⚠️ برای کسی که مجوزِ مدیریت ندارد، همان چیپِ خواندنی نمایش داده می‌شود، نه
 * دکمه‌ای که کلیکش سمتِ سرور رد شود.
 *
 * ⚠️ نقطهٔ رنگی و تیکِ گزینهٔ فعلی تزیین نیستند — `kteam-dot` و
 * `kteam-status-cur` ِ افزونه: تگِ هر گروه اغلب هم‌نامِ خودِ گروه است
 * («شروع نشده» در گروهِ «شروع نشده»)، پس بدونِ آنها سرگروه و آیتم یک‌شکل
 * دیده می‌شوند و فهرست تکراری به نظر می‌رسد.
 */
export function StatusPicker({
  projectId,
  name,
  group,
  statusId,
  options,
  canManage,
}: {
  projectId: number;
  name: string | null;
  group: string | null;
  /** وضعیتِ فعلی — تا همان گزینه در فهرست تیک بخورد. */
  statusId: number | null;
  options: StatusOption[];
  canManage: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // رنگِ وضعیتِ جاری از میانِ گزینه‌ها — کارت خودش رنگ را نمی‌فرستد.
  const color = options.find((o) => o.id === statusId)?.color ?? null;

  if (!canManage) return <ProjectStatus name={name} group={group} color={color} />;

  const grouped = new Map<string, StatusOption[]>();
  for (const o of options) {
    const key = o.group ?? '';
    grouped.set(key, [...(grouped.get(key) ?? []), o]);
  }

  const pick = (statusTagId: number | null) => {
    setError(null);
    startTransition(async () => {
      const result = await setStatusAction(projectId, statusTagId);
      if (result.error) setError(result.error);
    });
  };

  return (
    <div className="grid gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-1 disabled:opacity-60"
          title={t('تغییر وضعیت')}
          disabled={pending}
        >
          <ProjectStatus name={name} group={group} color={color} />
          <ChevronDown className="size-3 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem onSelect={() => pick(null)}>
            <span className="size-2 shrink-0" />
            {t('— بدونِ وضعیت —')}
            {statusId === null && <Check className="ms-auto size-3.5" />}
          </DropdownMenuItem>
          {[...grouped].map(([key, list]) => (
            <div key={key}>
              <DropdownMenuSeparator />
              {/* نامِ گروه فقط یک سرفصل است، نه گزینه: ریزتر و کم‌رنگ‌تر از خودِ وضعیت‌ها. */}
              {GROUP_LABEL[key] && (
                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-muted-foreground/80">
                  {t(GROUP_LABEL[key])}
                </DropdownMenuLabel>
              )}
              {list.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => pick(o.id)}>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: o.color || 'var(--color-muted-foreground)' }}
                  />
                  {o.name}
                  {o.id === statusId && <Check className="ms-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {error && <span className="text-[11px] text-destructive">{t(error)}</span>}
    </div>
  );
}
