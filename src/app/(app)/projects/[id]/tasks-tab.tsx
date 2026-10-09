'use client';

import { UserName } from '@/components/user-avatar';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Check, ChevronDown, Clapperboard, Columns3, EyeOff, Hand, Link2, List as ListIcon, Lock, MessageSquare, Paperclip } from 'lucide-react';
import { formatTimestamp } from '@/domain/files/video';
import { claimTaskAction, setTaskStatusAction } from '../_form/tab-actions';
import { canClaimTask } from '@/domain/projects/claim';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { TaskDialog } from './task-dialog';
import { GROUP_LABEL, TaskStatusPicker, type TaskStatusOption } from './task-status-picker';
export type { TaskStatusOption };
import { AddTaskDialog, type TaskFormOptions } from './add-task-dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n/client';
import { ltr } from '@/i18n/bidi';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TagChip } from '@/components/ui/tag-chip';
import { Input } from '@/components/ui/input';
import { TaskNumber } from '@/components/task-number';
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
  /** کارتِ تسک — اولویت، توضیح، شمار/آخرین یادداشت (پورتِ `task_notes_summary`). */
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
  lastNote?: string | null;
  /** عنوانِ تسکی که این یکی منتظرش است؛ null یعنی راه باز است. */
  blockedBy?: string | null;
  /** شمارهٔ تسک در پروژه (۲.۱۶.۰) — برای کارفرما null. */
  number?: number | null;
}

const GROUP_ORDER = ['todo', 'in_progress', 'complete', 'other'];

/**
 * سطرِ «چه کسی مسئول است» — `task_assignee_html()`.
 * تخصیصِ مستقیم نامِ شخص را نشان می‌دهد؛ تخصیصِ نقشی برای هر نقش یک چیپ دارد
 * و اگر کسی ساین نکرده باشد صریحاً می‌گوید.
 */
function Assignee({ task }: { task: TaskItem }) {
  const t = useT();
  if (task.assignedTo && task.assigneeName) {
    return (
      <UserName userId={task.assignedTo} name={task.assigneeName} className="text-xs text-muted-foreground" />
    );
  }
  // پورتِ «تخصیص‌نیافته» — نه نفر، نه نقش: کارتی که هیچ نمی‌گفت، بی‌صاحب بودنش را پنهان می‌کرد.
  if (task.roles.length === 0) return <span className="text-xs text-muted-foreground">{t('تخصیص‌نیافته')}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {task.roles.map((r, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          {r.roleName ?? '—'}
          {r.claimedBy
            ? <UserName userId={r.claimedBy} name={r.claimedByName ?? `#${r.claimedBy}`} />
            : ` — ${t('هنوز ساین نشده')}`}
        </span>
      ))}
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
        })}
      >
        <Hand className="size-3.5" />
        {pending ? <><Spinner />{tr('صبر کنید…')}</> : tr('برمی‌دارم')}
      </Button>
      {error && <span className="text-xs text-destructive">{tr(error)}</span>}
    </span>
  );
}

/** پورتِ کارتِ تسک: چیپِ اولویت به رنگِ تگ، توضیح، شمار و آخرین یادداشتِ گفتگو (`task_notes_summary`). */
/**
 * ریزه‌کاری‌های کارتِ تسک — اولویت، شمارِ یادداشت، توضیح، آخرین یادداشت.
 *
 * ⚠️ `compact` برای **نمای برد** است: آنجا کارت‌ها در ستون‌های باریک کنارِ هم
 * می‌نشینند و باید چند تا با هم دیده شوند؛ در نمای فهرست جا هست و کارت
 * می‌تواند راحت‌تر نفس بکشد.
 */
/**
 * رنگِ خیلی کمِ اولویت روی کلِ کارت — پورتِ `hex_to_rgba(.03/.16)` ِ نسخهٔ
 * قبلی: کارِ فوری در نگاه از بقیه جدا شود بی‌آنکه فهرست رنگارنگ شود.
 * color-mix روی `--card` تا در حالتِ تیره هم زمینه تیره بماند.
 */
function priorityTint(color: string | null | undefined): React.CSSProperties | undefined {
  if (!color) return undefined;
  return {
    backgroundColor: `color-mix(in oklab, ${color} 4%, var(--color-card))`,
    borderColor: `color-mix(in oklab, ${color} 22%, var(--color-border))`,
  };
}

function TaskExtras({ task, compact = false }: { task: TaskItem; compact?: boolean }) {
  const tr = useT();
  if (!task.priorityName && !task.description && !task.notesCount && !task.mediaCount && !task.blockedBy
    && !task.reviewId && !task.clientHidden && !task.area) return null;
  return (
    <div className={compact ? 'grid gap-0.5' : 'mt-1 grid gap-1'}>
      {/*
        ⚠️ «منتظرِ …» — تا وابستگی تمام نشده، نوبتِ این کار نرسیده. بدونِ
        این خط، کارتِ «در نوبت» می‌گفت دست نگه دار ولی نمی‌گفت منتظرِ چه.
      */}
      {task.blockedBy && (
        <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-500">
          <Link2 className="size-3" />
          {tr('منتظرِ: {title}', { title: task.blockedBy })}
        </span>
      )}
      {/* از کدام بازبینی و کجای ویدئو — بی‌بازکردنِ تسک معلوم شود این کار از کجا آمده. */}
      {task.reviewId && (
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          <Clapperboard className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{task.reviewTitle ?? tr('بازبینی')}</span>
          {task.reviewStart !== null && task.reviewStart !== undefined && (
            <span className="num shrink-0" dir="ltr">{formatTimestamp(task.reviewStart)}</span>
          )}
        </span>
      )}
      {(task.priorityName || (task.notesCount ?? 0) > 0 || (task.mediaCount ?? 0) > 0 || task.area || task.clientHidden) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {task.priorityName && (
            <TagChip color={task.priorityColor}>{task.priorityName}</TagChip>
          )}
          {(task.notesCount ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MessageSquare className="size-3" />
              <span className="num">{task.notesCount}</span>
            </span>
          )}
          {task.area && (
            <span className="rounded-sm bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{task.area}</span>
          )}
          {task.clientHidden && (
            <span className="flex items-center text-muted-foreground" title={tr('پنهان از کارفرما')}>
              <EyeOff className="size-3" aria-label={tr('پنهان از کارفرما')} />
            </span>
          )}
          {(task.mediaCount ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title={tr('تصویر و فایل')}>
              <Paperclip className="size-3" />
              <span className="num">{task.mediaCount}</span>
            </span>
          )}
        </div>
      )}
      {task.description && (
        <p className={`text-muted-foreground ${compact ? 'line-clamp-1 text-[11px]' : 'line-clamp-2 text-xs'}`}>
          {task.description}
        </p>
      )}
      {task.lastNote && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MessageSquare className="size-3 shrink-0" aria-hidden />
          <span className="line-clamp-1 min-w-0">{task.lastNote}</span>
        </p>
      )}
    </div>
  );
}

/**
 * بردِ درگ‌ودراپ — پورتِ `task_kanban`: یک ستون به‌ازای هر **تگِ** وضعیتِ تسک
 * (نه گروه)، تسکِ بی‌وضعیت در ستونِ اول؛ انداختنِ کارت وضعیتش را عوض می‌کند و
 * روی لمس، انتخابگرِ وضعیتِ روی کارت جایگزینِ کشیدن است (HTML5 DnD با انگشت کار نمی‌کند).
 */
function KanbanBoard({
  tasks,
  statuses,
  canDrag,
  onOpen,
  renderMeta,
}: {
  tasks: TaskItem[];
  statuses: TaskStatusOption[];
  canDrag: boolean;
  onOpen: (id: number) => void;
  renderMeta: (task: TaskItem) => React.ReactNode;
}) {
  const tr = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const first = statuses[0]?.id ?? null;
  const known = new Set(statuses.map((s) => s.id));
  const columns = new Map<number, TaskItem[]>(statuses.map((s) => [s.id, []]));
  for (const t of tasks) {
    const sid = t.statusTagId !== null && known.has(t.statusTagId) ? t.statusTagId : first;
    if (sid !== null) columns.get(sid)!.push(t);
  }

  const move = (taskId: number, statusId: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.statusTagId === statusId) return;
    startTransition(async () => {
      const result = await setTaskStatusAction(taskId, statusId);
      setError(result.error ?? null);
    });
  };

  if (statuses.length === 0) return <EmptyState title={tr("وضعیتی برای تسک تعریف نشده")} />;

  return (
    <div className="grid gap-2">
      {error && <p className="text-xs text-destructive">{tr(error)}</p>}
      {/* ⚠️ اسکرولِ افقی فقط داخلِ تخته است، نه کلِ صفحه؛ ستون‌ها هم‌عرض
          می‌مانند تا با زیادشدنِ وضعیت‌ها باریک و ناخوانا نشوند. */}
      <div className="flex gap-3 overflow-x-auto overscroll-x-contain pb-2">
        {statuses.map((s) => (
          <section
            key={s.id}
            onDragOver={(e) => { if (canDrag) { e.preventDefault(); setOver(s.id); } }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = Number(e.dataTransfer.getData('text/plain'));
              if (id) move(id, s.id);
            }}
            // ستونِ باریک‌تر و فاصله‌های کمتر — چند کارت با هم دیده شوند.
            className={`grid w-60 shrink-0 content-start gap-1.5 rounded-lg border-t-4 bg-muted/60 p-1.5 ${over === s.id ? 'ring-2 ring-primary/40' : ''}`}
            style={{ borderTopColor: s.color || 'var(--color-primary)' }}
          >
            <h4 className="flex items-center justify-between px-1 text-xs font-medium">
              {s.name}
              <span className="num text-muted-foreground">{columns.get(s.id)!.length}</span>
            </h4>
            {columns.get(s.id)!.map((t) => (
              <article
                key={t.id}
                draggable={canDrag}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(t.id));
                  e.dataTransfer.effectAllowed = 'move';
                  setDragging(t.id);
                }}
                onDragEnd={() => setDragging(null)}
                style={priorityTint(t.priorityColor)}
                className={`grid gap-1 rounded-lg border bg-card p-2 ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging === t.id || pending ? 'opacity-60' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className="flex items-start gap-1.5 text-start text-[13px] font-medium hover:underline"
                >
                  <TaskNumber number={t.number} className="mt-0.5" />
                  {t.isPrivate && <Lock className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
                  <span className="line-clamp-2">{t.title}</span>
                </button>
                <TaskExtras task={t} compact />
                <div className="flex flex-wrap items-center gap-1.5">{renderMeta(t)}</div>
                {canDrag && (
                  <NativeSelect
                    aria-label={tr("انتقال وضعیت")}
                    value={t.statusTagId ?? ''}
                    onChange={(e) => move(t.id, Number(e.target.value))}
                    size="sm" className="h-7 text-xs" containerClassName="sm:hidden"
                  >
                    {statuses.map((o) => <NativeSelectOption key={o.id} value={o.id}>{o.name}</NativeSelectOption>)}
                  </NativeSelect>
                )}
              </article>
            ))}
            {columns.get(s.id)!.length === 0 && <p className="px-1 pb-1 text-xs text-muted-foreground">—</p>}
          </section>
        ))}
      </div>
    </div>
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
  // سطل‌بندی بر پایهٔ گروه؛ تسکِ بی‌گروه در «بدون دسته».
  const { buckets, review } = useMemo(() => {
    const b = new Map<string, TaskItem[]>();
    for (const t of tasks) {
      /**
       * ⚠️ تسکی که «آماده برای بررسی» است در گروهِ خودش هم **نمی‌آید**.
       * گروهِ این وضعیت `in_progress` است، پس تسک هم‌زمان در «در حال انجام»
       * و در «نیاز به ریویو» دیده می‌شد و مدیر دو بار به یک کار می‌خورد.
       * کارش تمام شده و منتظرِ نظرِ کسِ دیگری است — جایش زیرتبِ ریویو است.
       */
      if (t.isReview) continue;
      const key = t.statusGroup && GROUP_LABEL[t.statusGroup] ? t.statusGroup : 'other';
      b.set(key, [...(b.get(key) ?? []), t]);
    }
    return { buckets: b, review: tasks.filter((t) => t.isReview) };
  }, [tasks]);

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
   * ⚠️ «شروع نشده» همیشه هست و پیش‌فرض است (همان زیرتبِ `todo` ِ نسخهٔ
   * قبلی)؛ گروه‌های دیگر فقط وقتی تسکی دارند. پیش از این صفحه روی اولین
   * گروهِ **غیرخالی** باز می‌شد و جای تب‌ها با هر تغییرِ وضعیت عوض می‌شد.
   */
  const groupKeys = GROUP_ORDER.filter((k) => k === 'todo' || (buckets.get(k)?.length ?? 0) > 0);
  const [tab, setTab] = useState<string>(
    initialGroup === 'review' && review.length > 0 ? 'review'
      : initialGroup === 'mine' ? 'mine'
      : initialGroup && GROUP_ORDER.includes(initialGroup) ? initialGroup
      : 'todo',
  );
  const [view, setView] = useState<'list' | 'board'>('list');

  const holdersMap = useMemo(
    () => new Map(Object.entries(roleHolders).map(([k, v]) => [Number(k), v])),
    [roleHolders],
  );


  const list = found ?? (tab === 'review' ? review : tab === 'mine' ? mine : (buckets.get(tab) ?? []));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
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
          className="me-auto h-8 w-48"
        />
        {formOptions && (
          <AddTaskDialog projectId={projectId} options={formOptions} canManage={canManage} currentUserId={currentUserId} />
        )}
      </div>

      {tasks.length === 0 && <EmptyState title={tr("تسکی ثبت نشده")} />}

      {/* زیرتب‌ها — «نیاز به ریویو» اول، ولی گروهِ اول پیش‌فرضِ فعال است. */}
      <div className={`overflow-x-auto overflow-y-hidden ${tasks.length === 0 || view === 'board' || found ? 'hidden' : ''}`}>
        <Tabs value={tab} onValueChange={setTab}>
          {/* همان قرصِ فیلترِ بقیهٔ اپ — اندازه و وزن یکی، نه نسخهٔ ریزِ خودش. */}
          <TabsList className="w-max">
            {review.length > 0 && (
              <TabsTrigger value="review" className="flex-none px-3">
                {tr('نیاز به ریویو')}
                <Badge variant="warning" className="num px-1.5 py-0 text-[10px]">{review.length}</Badge>
              </TabsTrigger>
            )}
            {groupKeys.map((k) => (
              <TabsTrigger key={k} value={k} className="flex-none px-3">
                {tr(GROUP_LABEL[k] ?? k)}
                <Badge variant="secondary" className="num px-1.5 py-0 text-[10px]">{buckets.get(k)?.length ?? 0}</Badge>
              </TabsTrigger>
            ))}
            {mine.length > 0 && (
              <TabsTrigger value="mine" className="flex-none px-3">
                {tr('من')}
                <Badge variant="secondary" className="num px-1.5 py-0 text-[10px]">{mine.length}</Badge>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      </div>

      {view === 'board' ? (
        <KanbanBoard
          tasks={found ?? tasks}
          statuses={statuses}
          canDrag={(canManage || canInteract) && !isFrozen}
          onOpen={setOpenTask}
          renderMeta={(t) => (
            <>
              <Assignee task={t} />
              {t.dueDate && <span className="num text-xs text-muted-foreground">{t.dueDate}</span>}
              <ClaimButton frozen={isFrozen} task={t} projectId={projectId} holders={holdersMap} userId={currentUserId} />
            </>
          )}
        />
      ) : (
      // ⚠️ کارتِ تسک تا لبهٔ صفحه کش نمی‌آید: روی نمایشگرِ پهن تا چهار ستون.
      // سطلی که خالی مانده (مثلاً پس از تغییرِ وضعیت) «تسکی نیست.» می‌گوید، نه صفحهٔ سفید.
      tasks.length > 0 && list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{found ? tr('تسکی با این شماره یا عنوان پیدا نشد.') : tr('تسکی نیست.')}</p>
      ) : (
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {list.map((t) => (
          /**
           * ⚠️ کلِ کارت باز می‌شود، نه فقط عنوان: هدفِ کلیک به اندازهٔ یک
           * خط بود و کاربر روی فضای خالیِ کارت کلیک می‌کرد و هیچ اتفاقی
           * نمی‌افتاد. کلیک روی کنترل‌های داخلی (وضعیت، برداشتن) بالا
           * نمی‌آید تا کارت را باز نکند.
           */
          <li
            key={t.id}
            onClick={() => setOpenTask(t.id)}
            style={priorityTint(t.priorityColor)}
            className="cursor-pointer rounded-lg border bg-card p-3 transition-colors hover:border-primary/40"
          >
            <div
              className="flex flex-wrap items-center justify-between gap-2"
              onClick={(e) => { if ((e.target as HTMLElement).closest('[data-stop]')) e.stopPropagation(); }}
            >
              <span className="flex items-center gap-1.5 text-start text-sm font-medium">
                {/* R-PROJ-17 — تسکِ خصوصی نشانِ خودش را دارد. */}
                <TaskNumber number={t.number} />
                {t.isPrivate && <Lock className="size-3.5 text-muted-foreground" />}
                {/* تسکِ انجام‌شده کم‌رنگ و خط‌خورده (`kteam-done`) — در نگاهِ اول از کارِ باز جدا شود. */}
                <span className={t.statusGroup === 'complete' ? 'text-muted-foreground line-through' : undefined}>{t.title}</span>
              </span>
              <span data-stop onClick={(e) => e.stopPropagation()}>
                <TaskStatusPicker task={t} options={statuses} canManage={(canManage || canInteract) && !isFrozen && statuses.length > 0} />
              </span>
            </div>
            <TaskExtras task={t} />
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <Assignee task={t} />
              {t.dueDate && (
                <span className="text-xs text-muted-foreground tabular-nums">{tr('ددلاین {date}', { date: ltr(t.dueDate) })}</span>
              )}
              <span data-stop onClick={(e) => e.stopPropagation()}>
                <ClaimButton
                  frozen={isFrozen}
                  task={t}
                  projectId={projectId}
                  holders={holdersMap}
                  userId={currentUserId}
                />
              </span>
            </div>
          </li>
        ))}
      </ul>
      )
      )}

      <TaskDialog
        taskId={openTask}
        open={openTask !== null}
        onOpenChange={(o) => !o && setOpenTask(null)}
      />
    </div>
  );
}
