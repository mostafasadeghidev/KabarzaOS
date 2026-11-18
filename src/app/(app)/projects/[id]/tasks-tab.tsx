'use client';

import { useToast } from '@/components/ui/toast';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Columns3, Hand, List as ListIcon } from 'lucide-react';
import { claimTaskAction } from '../_form/tab-actions';
import { canClaimTask } from '@/domain/projects/claim';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { TaskDialog } from './task-dialog';
import { type TaskStatusOption } from './task-status-picker';
export type { TaskStatusOption };
import { AddTaskDialog, type TaskFormOptions } from './add-task-dialog';
import { GROUP_BY_LABELS, TaskBoardView, TaskListView, usePersisted, type GroupBy } from './task-views';
import { EmptyState } from '@/components/ui/empty-state';
import { useT } from '@/i18n/client';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';
import { parseTaskRef } from '@/domain/projects/task-ref';

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
  statusTagId: number | null;
  statusName: string | null;
  statusGroup: string | null;
  /** رنگِ تگِ وضعیت — چیپ با همین رنگ کشیده می‌شود. */
  statusColor?: string | null;
  isReview: boolean | null;
  dueDate: string | null;
  isPrivate: boolean;
  assignedTo: number | null;
  assigneeName: string | null;
  roles: TaskRole[];
  /** بیننده وضعیتِ این تسک را عوض می‌کند — صاحبِ کار یا مدیر (۲.۳۹.۰). */
  canSetStatus?: boolean;
  /** کارتِ تسک — اولویت، توضیح، شمار/آخرین یادداشت (پورتِ `task_notes_summary`). */
  /** شناسهٔ اولویت — ویرایشِ سریع و گروه‌بندی (۳.۱۶.۰). */
  priorityTagId?: number | null;
  priorityName?: string | null;
  priorityColor?: string | null;
  description?: string;
  notesCount?: number;
  /** تصویر و فایلِ تسک و یادداشت‌هایش. */
  mediaCount?: number;
  /** پنهان از کارفرما (۱.۱۱۶.۰) — نشانش فقط برای تیم معنا دارد. */
  clientHidden?: boolean;
  /** موردِ بازبینی: عنوانِ بازبینی و زمانِ ویدئو. */
  reviewId?: number | null;
  reviewTitle?: string | null;
  reviewStart?: number | null;
  area?: string;
  /** ردیفِ کارکردِ پروژهٔ تعدادی (۲.۲۲.۰). */
  unitEntryName?: string | null;
  lastNote?: string | null;
  /** عنوانِ تسکی که این یکی منتظرش است؛ null یعنی راه باز است. */
  blockedBy?: string | null;
  /** شمارهٔ تسک در پروژه (۲.۱۶.۰) — برای کارفرما null. */
  number?: number | null;
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
  frozen = false,
}: {
  task: TaskItem;
  projectId: number;
  holders: Map<number, number[]>;
  userId: number;
  /** پروژهٔ منجمد: دکمه اصلاً نیست (`block_if_frozen`). */
  frozen?: boolean;
}) {
  const tr = useT();
  const { show } = useToast();
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

  if (!claimable || frozen) return null;

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
          if (!result?.error && result?.message) show(tr(result.message));
        })}
      >
        <Hand className="size-3.5" />
        {pending ? <><Spinner />{tr('صبر کنید…')}</> : tr('برمی‌دارم')}
      </Button>
      {error && <span className="text-xs text-destructive">{tr(error)}</span>}
    </span>
  );
}

export function TasksTab({
  projectId,
  tasks,
  statuses,
  canManage,
  canInteract = false,
  isFrozen = false,
  formOptions,
  roleHolders,
  currentUserId,
  initialGroup,
  initialTask = null,
}: {
  projectId: number;
  tasks: TaskItem[];
  statuses: TaskStatusOption[];
  canManage: boolean;
  /** هر شرکت‌کننده وضعیتِ تسک را عوض می‌کند (پورتِ dropdown ِ همهٔ بینندگان). */
  canInteract?: boolean;
  isFrozen?: boolean;
  /** نقش ← اعضایی که آن نقش را دارند؛ لازمِ قاعدهٔ «برداشتن». */
  roleHolders: Record<number, number[]>;
  currentUserId: number;
  /** حاضر بودنش یعنی کاربر می‌تواند تسک بسازد. */
  formOptions: TaskFormOptions | null;
  /**
   * زیرتبِ آغازین از `?view=` — تا شمارندهٔ «نیازمند ریویو» ِ کارتِ پروژه
   * مستقیم به همان‌جا برسد، نه فقط به صفحهٔ پروژه.
   */
  initialGroup?: string | null;
  /** شمارهٔ تسک از `?task=` (۲.۱۶.۰) — پیوندِ مستقیم همان تسک را باز می‌کند. */
  initialTask?: number | null;
}) {
  const tr = useT();
  const [openTask, setOpenTask] = useState<number | null>(
    () => (initialTask ? tasks.find((t) => t.number === initialTask)?.id ?? null : null),
  );
  /**
   * ⚠️ `useState` فقط یک بار مقدار می‌گیرد؛ پیوندِ تسکِ دیگری روی همین صفحه
   * (اعلان، کامنت) کامپوننت را دوباره سوار نمی‌کند — این اثر دنبالش می‌کند.
   * شماره فقط بینِ تسک‌هایی که خودِ بیننده دارد جستجو می‌شود، نه از سرور.
   */
  useEffect(() => {
    if (!initialTask) return;
    const id = tasks.find((t) => t.number === initialTask)?.id;
    if (id) setOpenTask(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTask]);

  /**
   * جستجو (۲.۱۶.۰): «325» یا «#325» ← همان تسک؛ متن ← عنوان. ⚠️ روی **همهٔ**
   * تسک‌ها، نه فقط زیرتبِ باز — کسی که شماره را می‌داند، وضعیتش را نمی‌داند.
   */
  const [query, setQuery] = useState('');
  const found = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    const ref = parseTaskRef(q);
    if (ref?.kind === 'local') {
      const exact = tasks.filter((t) => t.number === ref.number);
      if (exact.length > 0) return exact;
    }
    const needle = q.toLocaleLowerCase();
    return tasks.filter((t) => t.title.toLocaleLowerCase().includes(needle) || (t.area ?? '').toLocaleLowerCase().includes(needle));
  }, [query, tasks]);
  /**
   * ⚠️ تسکی که «آماده برای بررسی» است فیلترِ «نیاز به ریویو» ِ خودش را دارد (پرچمِ تگ، نه نامش —
   * R-PROJ-13)؛ پیش از ۳.۱۶.۰ زیرتبِ جدا بود.
   */
  const review = useMemo(() => tasks.filter((t) => t.isReview), [tasks]);

  /**
   * «من» — تسک‌هایی که مستقیم به بیننده سپرده شده یا نقشش را برداشته (پورتِ
   * `$show_mine`). برای مدیر و کارفرما که کلِ تخته را می‌بینند، کارِ خودشان را
   * جدا می‌کند؛ فقط وقتی چیزی دارد نشان داده می‌شود.
   */
  const mine = useMemo(
    () => tasks.filter((t) => t.assignedTo === currentUserId || t.roles.some((r) => r.claimedBy === currentUserId)),
    [tasks, currentUserId],
  );

  /**
   * ۳.۱۶.۰ — به‌جای زیرتب‌های گروهِ وضعیت، فیلترِ سریع + گروه‌بندی: «باز» (پیش‌فرض، بی انجام‌شده‌ها)،
   * «نیاز به ریویو»، «من»، «همه». گروه‌بندی همان کارِ زیرتب‌ها را می‌کند و همه با هم دیده می‌شوند.
   * پیوندِ قدیمیِ `?view=` همچنان کار می‌کند (review/mine/complete).
   */
  type Filter = 'open' | 'review' | 'mine' | 'all';
  const [filter, setFilter] = useState<Filter>(
    initialGroup === 'review' && review.length > 0 ? 'review'
      : initialGroup === 'mine' ? 'mine'
      : initialGroup === 'complete' ? 'all'
      : 'open',
  );
  const [view, setView] = usePersisted<'list' | 'board'>(`kz-task-view-${projectId}`, 'list');
  const [groupBy, setGroupBy] = usePersisted<GroupBy | 'none'>(`kz-task-group-${projectId}`, 'stage');
  // برد بی‌گروه معنا ندارد — ستون‌ها همان گروه‌اند.
  const boardGroup: GroupBy = groupBy === 'none' ? 'status' : groupBy;

  const holdersMap = useMemo(
    () => new Map(Object.entries(roleHolders).map(([k, v]) => [Number(k), v])),
    [roleHolders],
  );

  const filtered = found ?? (
    filter === 'review' ? review
      : filter === 'mine' ? mine
      : filter === 'open' ? tasks.filter((t) => t.statusGroup !== 'complete')
      : tasks
  );
  const counts: Record<Filter, number> = {
    open: tasks.filter((t) => t.statusGroup !== 'complete').length,
    review: review.length,
    mine: mine.length,
    all: tasks.length,
  };
  const canEdit = canManage && !isFrozen;
  const canStatus = (canManage || canInteract) && !isFrozen;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter روی یک نتیجهٔ تنها ← همان تسک باز می‌شود.
            if (e.key === 'Enter' && found?.length === 1) setOpenTask(found[0]!.id);
          }}
          placeholder={tasks.some((t) => t.number) ? tr('شماره یا عنوانِ تسک…') : tr('عنوانِ تسک…')}
          aria-label={tr('جستجوی تسک')}
          className="h-8 w-full sm:w-48"
        />
        <NativeSelect
          size="sm" aria-label={tr('گروه‌بندی')} containerClassName="w-40"
          value={view === 'board' ? boardGroup : groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy | 'none')}
        >
          {(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((k) => (
            <NativeSelectOption key={k} value={k}>{tr('گروه: {name}', { name: tr(GROUP_BY_LABELS[k]) })}</NativeSelectOption>
          ))}
          {view === 'list' && <NativeSelectOption value="none">{tr('بی‌گروه')}</NativeSelectOption>}
        </NativeSelect>
        {/* نمای برد — همان تسک‌ها، چیدمانِ ستونی (پورتِ task_kanban). */}
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          // تک‌انتخابی نباید خالی بماند: کلیک روی گزینهٔ فعال بی‌اثر است.
          onValueChange={(v) => { if (v) setView(v as typeof view); }}
        >
          <ToggleGroupItem value="list" aria-label={tr('نمای فهرست')}>
            <ListIcon className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="board" aria-label={tr('نمای برد')}>
            <Columns3 className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
        {formOptions && (
          <span className="ms-auto">
            <AddTaskDialog projectId={projectId} options={formOptions} canManage={canManage} currentUserId={currentUserId} />
          </span>
        )}
      </div>

      {tasks.length === 0 && <EmptyState title={tr("تسکی ثبت نشده")} />}

      {/* فیلترِ سریع — جستجو که فعال است کنار می‌رود (جستجو روی همهٔ تسک‌هاست). */}
      {tasks.length > 0 && !found && (
        <div className="flex flex-wrap gap-1.5">
          {(['open', 'review', 'mine', 'all'] as Filter[]).filter((f) => f === 'open' || f === 'all' || counts[f] > 0).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${filter === f ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary/40'}`}
            >
              {tr({ open: 'باز', review: 'نیاز به ریویو', mine: 'من', all: 'همه' }[f])}
              <span className={`num ${filter === f ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      {/* key: با عوض شدنِ «فهرست/برد» محتوا از نو سوار می‌شود و همان انیمیشنِ ورودِ تب‌ها را می‌گیرد. */}
      <div key={view} data-view-swap className="min-w-0">
        {tasks.length > 0 && filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{found ? tr('تسکی با این شماره یا عنوان پیدا نشد.') : tr('تسکی نیست.')}</p>
        ) : view === 'board' ? (
          <TaskBoardView
            projectId={projectId}
            tasks={filtered}
            statuses={statuses}
            options={formOptions}
            groupBy={boardGroup}
            canEdit={canEdit}
            canStatus={canStatus}
            onOpen={setOpenTask}
          />
        ) : filtered.length > 0 && (
          <TaskListView
            projectId={projectId}
            tasks={filtered}
            statuses={statuses}
            options={formOptions}
            groupBy={groupBy}
            canEdit={canEdit}
            canStatus={canStatus}
            onOpen={setOpenTask}
            renderClaim={(t) => (
              <ClaimButton frozen={isFrozen} task={t} projectId={projectId} holders={holdersMap} userId={currentUserId} />
            )}
          />
        )}
      </div>

      <TaskDialog
        taskId={openTask}
        open={openTask !== null}
        onOpenChange={(o) => !o && setOpenTask(null)}
      />
    </div>
  );
}
