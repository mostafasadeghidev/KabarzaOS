'use client';

import { useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
import { setStatusAction } from './_form/card-actions';
import { ProjectStatus } from './project-status';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n/client';

export interface StatusOption {
  id: number;
  name: string;
  group: string | null;
}

/** برچسبِ گروه‌ها — `Tags::project_status_groups()`. */
const GROUP_LABEL: Record<string, string> = {
  not_started: 'شروع نشده',
  lead: 'احتمالِ عقد قرارداد',
  in_progress: 'در حال انجام',
  completed: 'تکمیل‌شده',
  on_hold: 'متوقف',
  cancelled: 'لغوشده',
};

/**
 * چیپِ وضعیت که خودش دکمهٔ تغییر است — `status_dropdown_html()`.
 *
 * ⚠️ برای کسی که مجوزِ مدیریت ندارد، همان چیپِ خواندنی نمایش داده می‌شود، نه
 * دکمه‌ای که کلیکش سمتِ سرور رد شود.
 */
export function StatusPicker({
  projectId,
  name,
  group,
  options,
  canManage,
}: {
  projectId: number;
  name: string | null;
  group: string | null;
  options: StatusOption[];
  canManage: boolean;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return <ProjectStatus name={name} group={group} />;

  const grouped = new Map<string, StatusOption[]>();
  for (const o of options) {
    const key = o.group ?? '';
    grouped.set(key, [...(grouped.get(key) ?? []), o]);
  }

  const pick = (statusTagId: number | null) => {
  const tr = useT();
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
          title={t("تغییر وضعیت")}
          disabled={pending}
        >
          <ProjectStatus name={name} group={group} />
          <ChevronDown className="size-3 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem onSelect={() => pick(null)}>{t("— بدونِ وضعیت —")}</DropdownMenuItem>
          {[...grouped].map(([key, list]) => (
            <div key={key}>
              <DropdownMenuSeparator />
              {GROUP_LABEL[key] && <DropdownMenuLabel>{t(GROUP_LABEL[key])}</DropdownMenuLabel>}
              {list.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => pick(o.id)}>
                  {o.name}
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
