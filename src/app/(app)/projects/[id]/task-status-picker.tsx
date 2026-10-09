'use client';

import { useToast } from '@/components/ui/toast';
import { useState, useTransition } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { setTaskStatusAction } from '../_form/tab-actions';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { groupLabels, TASK_STATUS_GROUPS } from '@/domain/tags/groups';
import { useT } from '@/i18n/client';
import { TagChip } from '@/components/ui/tag-chip';

/**
 * چیپِ وضعیتِ تسک — و اگر اجازه باشد، انتخابگرش.
 *
 * ⚠️ فایلِ جدا، نه داخلِ `tasks-tab`: مودالِ تسک هم لازمش دارد و آن فایل
 * خودش `task-dialog` را وارد می‌کند؛ وارد کردنِ متقابل حلقه می‌ساخت.
 */

export interface TaskStatusOption {
  id: number;
  name: string;
  group: string | null;
  color: string | null;
}

/** برچسبِ گروه‌های وضعیتِ تسک — `Tags::status_groups()`. */
export const GROUP_LABEL: Record<string, string> = {
  ...groupLabels(TASK_STATUS_GROUPS),
  other: 'بدون دسته',
};

export interface StatusTask {
  id: number;
  statusTagId: number | null;
  statusName: string | null;
  statusColor?: string | null;
  isReview: boolean | null;
}

export function TaskStatusPicker({
  task,
  options,
  canManage,
  onChanged,
}: {
  task: StatusTask;
  options: TaskStatusOption[];
  canManage: boolean;
  /** پس از تغییرِ موفق — مودال داده‌اش را از نو می‌خواند. */
  onChanged?: () => void;
}) {
  const tr = useT();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * ⚠️ رنگ از **خودِ تگِ وضعیت** می‌آید — همان رنگی که مدیر در تنظیمات
   * انتخاب کرده — ولی به شکلِ نقطه روی چیپِ خنثی (DESIGN.md §۲)، نه بجِ
   * توپر. تگِ بی‌رنگ نقطهٔ خاکستری می‌گیرد و «نیاز به ریویو» زردِ هشدار را.
   */
  const chip = task.statusName ? (
    <TagChip color={task.statusColor || (task.isReview ? 'var(--color-warning)' : null)}>
      {task.statusName}
    </TagChip>
  ) : (
    <Badge variant="outline">{tr("بدون وضعیت")}</Badge>
  );

  if (!canManage) return chip;

  const grouped = new Map<string, TaskStatusOption[]>();
  for (const o of options) {
    const key = o.group ?? '';
    grouped.set(key, [...(grouped.get(key) ?? []), o]);
  }

  const pick = (statusTagId: number | null) => {
    setError(null);
    startTransition(async () => {
      const result = await setTaskStatusAction(task.id, statusTagId);
      if (result.error) setError(result.error);
      else {
        // تأییدِ دیدنی (۲.۱۷.۱) — تغییرِ چیپ به‌تنهایی از چشم می‌افتاد.
        const name = options.find((o) => o.id === statusTagId)?.name;
        show(name ? tr('وضعیت به «{status}» تغییر کرد.', { status: name }) : tr('وضعیت برداشته شد.'), 'success');
        onChanged?.();
      }
    });
  };

  return (
    <div className="grid gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-1 disabled:opacity-60"
          title={tr("تغییر وضعیت")}
          disabled={pending}
        >
          {chip}
          <ChevronDown className="size-3 text-muted-foreground" />
        </DropdownMenuTrigger>
        {/*
          ⚠️ `pointerEvents: 'auto'` — این انتخابگر داخلِ مودال هم می‌نشیند و
          Radix روی صفحهٔ پشتِ مودال `pointer-events: none` می‌گذارد؛ فهرستِ
          پورتال‌شده آن را ارث می‌بَرد و کلیک‌ناپذیر می‌شود.
        */}
        <DropdownMenuContent
          align="start"
          className="max-h-72 overflow-y-auto"
          style={{ pointerEvents: 'auto' }}
        >
          <DropdownMenuItem onSelect={() => pick(null)}>
            <span className="size-2 shrink-0" />
            {tr("— بدون وضعیت —")}
            {task.statusTagId === null && <Check className="ms-auto size-3.5" />}
          </DropdownMenuItem>
          {[...grouped].map(([key, list]) => (
            <div key={key}>
              <DropdownMenuSeparator />
              {/* نامِ گروه سرفصل است نه گزینه — ریزتر و کم‌رنگ‌تر، مثلِ وضعیتِ پروژه. */}
              {GROUP_LABEL[key] && (
                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-muted-foreground/80">
                  {tr(GROUP_LABEL[key])}
                </DropdownMenuLabel>
              )}
              {list.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => pick(o.id)}>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: o.color || 'var(--color-muted-foreground)' }}
                  />
                  {o.name}
                  {o.id === task.statusTagId && <Check className="ms-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <span className="text-[11px] text-destructive">{tr(error)}</span>}
    </div>
  );
}
