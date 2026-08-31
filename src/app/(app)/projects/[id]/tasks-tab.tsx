'use client';

import { useMemo, useState, useTransition } from 'react';
import { ChevronDown, Columns3, Hand, List as ListIcon, Lock, User } from 'lucide-react';
import { claimTaskAction, setTaskStatusAction } from '../_form/tab-actions';
import { BOARD_COLUMNS, canClaimTask, groupIntoColumns } from '@/domain/projects/claim';
import { Button } from '@/components/ui/button';
import { TaskDialog } from './task-dialog';
import { AddTaskDialog, type TaskFormOptions } from './add-task-dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n/client';

/**
 * تبِ تسک‌ها — بازسازیِ `edit_tasks_subtabs()` + `edit_task_li()`.
 *
 * تسک‌ها به **گروهِ وضعیت** سطل‌بندی می‌شوند و هر گروه زیرتبِ خودش را دارد؛
 * «نیاز به ریویو» زیرتبِ جداگانه‌ای است که اول می‌آید.
 */

export interface TaskRole {
  roleTagId: number | null;
  roleName: string | null;
  claimedBy: number | null;
  claimedByName: string | null;
}

export interface TaskItem {
  id: number;
  title: string;
  statusName: string | null;
  statusGroup: string | null;
  isReview: boolean | null;
  dueDate: string | null;
  isPrivate: boolean;
  assignedTo: number | null;
  assigneeName: string | null;
  roles: TaskRole[];
}

export interface TaskStatusOption {
  id: number;
  name: string;
  group: string | null;
}

/** برچسبِ گروه‌های وضعیتِ تسک — `Tags::status_groups()`. */
const GROUP_LABEL: Record<string, string> = {
  todo: 'انجام‌نشده',
  in_progress: 'در حال انجام',
  complete: 'انجام‌شده',
  other: 'بدون دسته',
};
const GROUP_ORDER = ['todo', 'in_progress', 'complete', 'other'];

/**
 * سطرِ «چه کسی مسئول است» — `task_assignee_html()`.
 * تخصیصِ مستقیم نامِ شخص را نشان می‌دهد؛ تخصیصِ نقشی برای هر نقش یک چیپ دارد
 * و اگر کسی ساین نکرده باشد صریحاً می‌گوید.
 */
function Assignee({ task }: { task: TaskItem }) {
  if (task.assignedTo && task.assigneeName) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <User className="size-3" />
        {task.assigneeName}
      </span>
    );
  }
  if (task.roles.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {task.roles.map((r, i) => (
        <span key={i} className="text-xs text-muted-foreground">
          {r.roleName ?? '—'}
          {r.claimedBy
            ? ` (${r.claimedByName ?? `#${r.claimedBy}`})`
            : ' — هنوز ساین نشده'}
        </span>
      ))}
    </div>
  );
}

function TaskStatusPicker({
  task,
  options,
  canManage,
}: {
  task: TaskItem;
  options: TaskStatusOption[];
  canManage: boolean;
}) {
  const tr = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const chip = task.statusName ? (
    <Badge variant={task.isReview ? 'warning' : 'secondary'}>{task.statusName}</Badge>
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
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem onSelect={() => pick(null)}>{tr("— بدون وضعیت —")}</DropdownMenuItem>
          {[...grouped].map(([key, list]) => (
            <div key={key}>
              <DropdownMenuSeparator />
              {GROUP_LABEL[key] && <DropdownMenuLabel>{tr(GROUP_LABEL[key])}</DropdownMenuLabel>}
              {list.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => pick(o.id)}>
                  {o.name}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}

/**
 * دکمهٔ «این تسک را برمی‌دارم».
 * ⚠️ فقط وقتی دیده می‌شود که واقعاً چیزی عوض شود — قاعده در دامنه است.
 */
function ClaimButton({
  task,
  projectId,
  holders,
  userId,
}: {
  task: TaskItem;
  projectId: number;
  holders: Map<number, number[]>;
  userId: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const claimable = canClaimTask({
    assignedTo: task.assignedTo,
    roles: task.roles
      .filter((r) => r.roleTagId !== null)
      .map((r) => ({ roleTagId: r.roleTagId!, claimedBy: r.claimedBy })),
    roleHolders: holders,
    userId,
  });

  if (!claimable) return null;

  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await claimTaskAction(task.id, projectId);
          setError(result?.error ?? null);
        })}
      >
        <Hand className="size-3.5" />
        {pending ? 'صبر کنید…' : 'برمی‌دارم'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

export function TasksTab({
  projectId,
  tasks,
  statuses,
  canManage,
  formOptions,
  roleHolders,
  currentUserId,
}: {
  projectId: number;
  tasks: TaskItem[];
  statuses: TaskStatusOption[];
  canManage: boolean;
  /** نقش ← اعضایی که آن نقش را دارند؛ لازمِ قاعدهٔ «برداشتن». */
  roleHolders: Record<number, number[]>;
  currentUserId: number;
  /** حاضر بودنش یعنی کاربر می‌تواند تسک بسازد. */
  formOptions: TaskFormOptions | null;
}) {
  const tr = useT();
  const [openTask, setOpenTask] = useState<number | null>(null);
  // سطل‌بندی بر پایهٔ گروه؛ تسکِ بی‌گروه در «بدون دسته».
  const { buckets, review } = useMemo(() => {
    const b = new Map<string, TaskItem[]>();
    for (const t of tasks) {
      const key = t.statusGroup && GROUP_LABEL[t.statusGroup] ? t.statusGroup : 'other';
      b.set(key, [...(b.get(key) ?? []), t]);
    }
    return { buckets: b, review: tasks.filter((t) => t.isReview) };
  }, [tasks]);

  const groupKeys = GROUP_ORDER.filter((k) => (buckets.get(k)?.length ?? 0) > 0);
  const [tab, setTab] = useState<string>(groupKeys[0] ?? 'other');
  const [view, setView] = useState<'list' | 'board'>('list');

  const holdersMap = useMemo(
    () => new Map(Object.entries(roleHolders).map(([k, v]) => [Number(k), v])),
    [roleHolders],
  );

  const columns = useMemo(
    () => groupIntoColumns(tasks.map((t) => ({ ...t, isReview: Boolean(t.isReview) }))),
    [tasks],
  );

  const list = tab === 'review' ? review : (buckets.get(tab) ?? []);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* نمای برد — همان تسک‌ها، چیدمانِ ستونی (پورتِ task_kanban). */}
        <div className="me-auto flex rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setView('list')}
            className={`rounded px-2 py-1 text-xs ${view === 'list' ? 'bg-muted' : 'text-muted-foreground'}`}
          >
            <ListIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView('board')}
            className={`rounded px-2 py-1 text-xs ${view === 'board' ? 'bg-muted' : 'text-muted-foreground'}`}
          >
            <Columns3 className="size-3.5" />
          </button>
        </div>
        {formOptions && <AddTaskDialog projectId={projectId} options={formOptions} />}
      </div>

      {tasks.length === 0 && <EmptyState title={tr("تسکی ثبت نشده")} />}

      {/* زیرتب‌ها — «نیاز به ریویو» اول، ولی گروهِ اول پیش‌فرضِ فعال است. */}
      <div className={`flex flex-wrap gap-1 border-b pb-2 ${tasks.length === 0 || view === 'board' ? 'hidden' : ''}`}>
        {review.length > 0 && (
          <button
            type="button"
            onClick={() => setTab('review')}
            className={`rounded-md px-2.5 py-1 text-xs ${
              tab === 'review' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {tr('نیاز به ریویو {n}', { n: review.length })}
          </button>
        )}
        {groupKeys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-2.5 py-1 text-xs ${
              tab === k ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {tr(GROUP_LABEL[k] ?? k)} <span className="num">{buckets.get(k)!.length}</span>
          </button>
        ))}
      </div>

      {view === 'board' ? (
        <div className="grid gap-3 @2xl/main:grid-cols-4">
          {BOARD_COLUMNS.map((col) => (
            <section key={col.group} className="grid content-start gap-2 rounded-md bg-muted/40 p-2">
              <h4 className="flex items-center justify-between px-1 text-xs font-medium">
                {tr(col.label)}
                <span className="num text-muted-foreground">{columns.get(col.group)!.length}</span>
              </h4>
              {columns.get(col.group)!.map((t) => (
                <article key={t.id} className="grid gap-1.5 rounded-md border bg-background p-2">
                  <button
                    type="button"
                    onClick={() => setOpenTask(t.id)}
                    className="flex items-start gap-1.5 text-start text-sm hover:underline"
                  >
                    {t.isPrivate && <Lock className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
                    <span className="line-clamp-2">{t.title}</span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Assignee task={t} />
                    {t.dueDate && <span className="num text-xs text-muted-foreground">{t.dueDate}</span>}
                  </div>
                  <ClaimButton
                    task={t}
                    projectId={projectId}
                    holders={holdersMap}
                    userId={currentUserId}
                  />
                </article>
              ))}
              {columns.get(col.group)!.length === 0 && (
                <p className="px-1 pb-1 text-xs text-muted-foreground">—</p>
              )}
            </section>
          ))}
        </div>
      ) : (
      <ul className="grid gap-2">
        {list.map((t) => (
          <li key={t.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setOpenTask(t.id)}
                className="flex items-center gap-1.5 text-start text-sm font-medium hover:underline"
              >
                {/* R-PROJ-17 — تسکِ خصوصی نشانِ خودش را دارد. */}
                {t.isPrivate && <Lock className="size-3.5 text-muted-foreground" />}
                {t.title}
              </button>
              <TaskStatusPicker task={t} options={statuses} canManage={canManage} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <Assignee task={t} />
              {t.dueDate && (
                <span className="num text-xs text-muted-foreground">ددلاین {t.dueDate}</span>
              )}
              <ClaimButton
                task={t}
                projectId={projectId}
                holders={holdersMap}
                userId={currentUserId}
              />
            </div>
          </li>
        ))}
      </ul>
      )}

      <TaskDialog
        taskId={openTask}
        open={openTask !== null}
        onOpenChange={(o) => !o && setOpenTask(null)}
      />
    </div>
  );
}
