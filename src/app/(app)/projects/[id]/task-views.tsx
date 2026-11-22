'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { CalendarDays, ChevronDown, Lock, MessageSquare, MoreHorizontal, Paperclip, X } from 'lucide-react';
import { patchTasksAction, setTaskStatusAction } from '../_form/tab-actions';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TagChip } from '@/components/ui/tag-chip';
import { TaskNumber } from '@/components/task-number';
import { UserName } from '@/components/user-avatar';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/utils';
import { GROUP_LABEL, TaskStatusPicker, type TaskStatusOption } from './task-status-picker';
import type { TaskFormOptions } from './add-task-dialog';
import type { TaskItem } from './tasks-tab';

/**
 * نماهای فهرست و برد ِ تبِ تسک‌ها (۳.۱۶.۰).
 *
 * ⚠️ چرا: فهرستِ پیشین فقط کارت بود و برد فقط نمایش (کشیدن داشت ولی نشانی نداشت)؛ هیچ تغییری جز
 * وضعیت از رویشان نمی‌شد و برد با ستونی به‌ازای هر وضعیت هم پهن بود هم بلند. حالا:
 *  · **گروه‌بندی** (هر دو نما): وضعیت، مرحله (گروهِ وضعیت)، اولویت یا مسئول.
 *  · **فهرست**: ویرایشِ درجای وضعیت/اولویت/مسئول/ددلاین، انتخابِ چندتایی و نوارِ تغییرِ گروهی،
 *    گروه‌های جمع‌شدنی.
 *  · **برد**: ستون‌ها ارتفاعِ محدود و پیمایشِ درونی دارند، جمع می‌شوند، ستون‌های خالی پنهان‌شدنی‌اند،
 *    کارتِ فشرده با منوی سریع، و کشیدن در هر گروه‌بندی همان فیلد را عوض می‌کند.
 * ⚠️ هر تغییر از همان `updateTask`/`setTaskStatus` ِ سرور می‌گذرد — گاردها و اعلان‌ها همان‌اند.
 */

export type GroupBy = 'status' | 'stage' | 'priority' | 'assignee';

export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  status: 'وضعیت',
  stage: 'مرحله',
  priority: 'اولویت',
  assignee: 'مسئول',
};

const STAGE_ORDER = ['todo', 'in_progress', 'complete', 'other'];

interface Group {
  key: string;
  label: string;
  color?: string | null;
  tasks: TaskItem[];
  /** مقصدِ کشیدن به این گروه — چه فیلدی با چه مقداری عوض شود. */
  drop?: { kind: 'status'; id: number } | { kind: 'priority'; id: number | null } | { kind: 'assignee'; id: number | null };
}

/** ساختِ گروه‌ها — ترتیبِ ثابت (همان ترتیبِ تنظیمات)، تا جای ستون‌ها با هر تغییر عوض نشود. */
function buildGroups(
  tasks: TaskItem[],
  by: GroupBy,
  statuses: TaskStatusOption[],
  options: TaskFormOptions | null,
  tr: (k: string) => string,
): Group[] {
  if (by === 'status') {
    const first = statuses[0]?.id ?? null;
    const known = new Set(statuses.map((s) => s.id));
    return statuses.map((s) => ({
      key: `s${s.id}`, label: s.name, color: s.color, drop: { kind: 'status' as const, id: s.id },
      tasks: tasks.filter((t) => (t.statusTagId !== null && known.has(t.statusTagId) ? t.statusTagId : first) === s.id),
    }));
  }
  if (by === 'stage') {
    return STAGE_ORDER.map((g) => {
      const target = statuses.find((s) => (s.group ?? 'other') === g);
      return {
        key: `g${g}`, label: tr(GROUP_LABEL[g] ?? g),
        drop: target ? { kind: 'status' as const, id: target.id } : undefined,
        tasks: tasks.filter((t) => ((t.statusGroup && GROUP_LABEL[t.statusGroup]) ? t.statusGroup : 'other') === g),
      };
    }).filter((g) => g.tasks.length > 0 || g.drop);
  }
  if (by === 'priority') {
    const list = options?.priorities ?? [];
    const names = new Map<number, { name: string; color: string | null }>();
    for (const t of tasks) if (t.priorityTagId) names.set(t.priorityTagId, { name: t.priorityName ?? '', color: t.priorityColor ?? null });
    const ids = [...new Set([...list.map((p) => p.id), ...names.keys()])];
    return [
      ...ids.map((id) => ({
        key: `p${id}`, label: list.find((p) => p.id === id)?.name ?? names.get(id)?.name ?? `#${id}`,
        color: names.get(id)?.color ?? null, drop: { kind: 'priority' as const, id },
        tasks: tasks.filter((t) => t.priorityTagId === id),
      })),
      { key: 'p0', label: tr('بدونِ اولویت'), drop: { kind: 'priority' as const, id: null }, tasks: tasks.filter((t) => !t.priorityTagId) },
    ];
  }
  // مسئول: مستقیم، وگرنه «نقشی» (برداشته یا نه)، وگرنه «تخصیص‌نیافته».
  const people = new Map<number, string>();
  for (const a of options?.assignees ?? []) people.set(a.userId, a.label);
  for (const t of tasks) if (t.assignedTo) people.set(t.assignedTo, t.assigneeName ?? people.get(t.assignedTo) ?? `#${t.assignedTo}`);
  return [
    ...[...people].map(([id, name]) => ({
      key: `u${id}`, label: name, drop: { kind: 'assignee' as const, id }, tasks: tasks.filter((t) => t.assignedTo === id),
    })),
    { key: 'roles', label: tr('نقشی'), tasks: tasks.filter((t) => !t.assignedTo && t.roles.length > 0) },
    { key: 'u0', label: tr('تخصیص‌نیافته'), drop: { kind: 'assignee' as const, id: null }, tasks: tasks.filter((t) => !t.assignedTo && t.roles.length === 0) },
  ];
}

/** حالتِ ذخیره‌شده در مرورگر — فقط ترجیحِ نمایش؛ نبودِ storage هیچ اشکالی نمی‌سازد. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw !== null) setValue(JSON.parse(raw) as T); } catch { /* خصوصی */ }
  }, [key]);
  const set = (v: T) => { setValue(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* پر یا بسته */ } };
  return [value, set];
}

/** اجرای یک تغییر روی چند تسک با پیامِ نتیجه. */
function useTaskMutations() {
  const tr = useT();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const report = (r: { error?: string; failed?: number }, n: number) => {
    if (r.error) show(tr(r.error), 'error');
    else if (r.failed) show(tr('{ok} تسک تغییر کرد؛ {failed} تسک اجازه نداشت.', { ok: n - r.failed, failed: r.failed }), 'error');
    else show(n > 1 ? tr('{n} تسک تغییر کرد.', { n }) : tr('تغییر ثبت شد.'), 'success');
  };
  const patch = (ids: number[], p: Parameters<typeof patchTasksAction>[1]) =>
    startTransition(async () => report(await patchTasksAction(ids, p), ids.length));
  const status = (ids: number[], statusId: number) => startTransition(async () => {
    let failed = 0; let error: string | undefined;
    for (const id of ids) { const r = await setTaskStatusAction(id, statusId); if (r.error) { failed++; error = r.error; } }
    report(failed === ids.length ? { error } : { failed }, ids.length);
  });
  const apply = (ids: number[], drop: NonNullable<Group['drop']>) => {
    if (drop.kind === 'status') status(ids, drop.id);
    else if (drop.kind === 'priority') patch(ids, { priorityTagId: drop.id });
    else patch(ids, { assignedTo: drop.id });
  };
  return { pending, patch, status, apply };
}

/** مسئول — نامِ شخص، نقش‌ها، یا «تخصیص‌نیافته». */
function AssigneeText({ task, short = false }: { task: TaskItem; short?: boolean }) {
  const t = useT();
  if (task.assignedTo && task.assigneeName) {
    return <UserName userId={task.assignedTo} name={task.assigneeName} size="sm" className={cn('text-xs', short && 'max-w-32 truncate')} />;
  }
  if (task.roles.length === 0) return <span className="text-xs text-muted-foreground">{t('تخصیص‌نیافته')}</span>;
  return (
    <span className="truncate text-xs text-muted-foreground">
      {task.roles.map((r) => (r.claimedByName ? `${r.roleName ?? ''}: ${r.claimedByName}` : r.roleName ?? '—')).join(t('، '))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * فهرست
 * ------------------------------------------------------------------ */

export function TaskListView({
  projectId, tasks, statuses, options, groupBy, canEdit, canStatus, onOpen, renderClaim,
}: {
  projectId: number;
  tasks: TaskItem[];
  statuses: TaskStatusOption[];
  options: TaskFormOptions | null;
  groupBy: GroupBy | 'none';
  /** ویرایشِ اولویت/مسئول/ددلاین (مدیرِ پروژه، پروژهٔ باز). */
  canEdit: boolean;
  /** تغییرِ وضعیت — هر تسک جدا هم `canSetStatus` دارد. */
  canStatus: boolean;
  onOpen: (id: number) => void;
  renderClaim: (task: TaskItem) => React.ReactNode;
}) {
  const tr = useT();
  const m = useTaskMutations();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = usePersisted<string[]>(`kz-task-collapsed-${projectId}`, []);
  // انتخابِ تسکی که دیگر در فهرست نیست (فیلتر/جستجو) پاک می‌شود.
  const visibleIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  useEffect(() => {
    setSelected((s) => { const next = new Set([...s].filter((id) => visibleIds.has(id))); return next.size === s.size ? s : next; });
  }, [visibleIds]);

  const groups: Group[] = groupBy === 'none'
    ? [{ key: 'all', label: '', tasks }]
    : buildGroups(tasks, groupBy, statuses, options, tr).filter((g) => g.tasks.length > 0);
  const selectable = canEdit || canStatus;
  const toggle = (id: number, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const toggleGroup = (g: Group, on: boolean) => setSelected((s) => {
    const n = new Set(s); for (const t of g.tasks) { if (on) n.add(t.id); else n.delete(t.id); } return n;
  });
  const ids = [...selected];

  return (
    <div className="grid gap-3 pb-16">
      {groups.map((g) => {
        const isCollapsed = collapsed.includes(g.key);
        const allOn = g.tasks.length > 0 && g.tasks.every((t) => selected.has(t.id));
        return (
          <section key={g.key} className="overflow-hidden rounded-xl border bg-card">
            {g.label && (
              <header className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                {selectable && (
                  <Checkbox
                    aria-label={tr('انتخابِ همهٔ این گروه')}
                    checked={allOn ? true : g.tasks.some((t) => selected.has(t.id)) ? 'indeterminate' : false}
                    onCheckedChange={(v) => toggleGroup(g, v === true)}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setCollapsed(isCollapsed ? collapsed.filter((k) => k !== g.key) : [...collapsed, g.key])}
                  className="flex min-w-0 flex-1 items-center gap-2 text-start text-sm font-semibold"
                  aria-expanded={!isCollapsed}
                >
                  <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isCollapsed && 'ltr:-rotate-90 rtl:rotate-90')} />
                  {g.color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: g.color }} />}
                  <span className="truncate">{g.label}</span>
                  <span className="num rounded-full bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">{g.tasks.length}</span>
                </button>
              </header>
            )}
            {!isCollapsed && (
              <ul className="divide-y">
                {g.tasks.map((t) => (
                  <li
                    key={t.id}
                    data-tour="tasks-item"
                    className={cn(
                      'grid cursor-pointer gap-x-3 gap-y-1.5 px-3 py-2 transition-colors hover:bg-muted/40',
                      'grid-cols-[auto_1fr] md:grid-cols-[auto_minmax(0,1fr)_9rem_8rem_10rem_8.5rem] md:items-center',
                      selected.has(t.id) && 'bg-primary/5',
                    )}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-stop]')) onOpen(t.id); }}
                  >
                    <span data-stop className="row-span-2 flex items-start pt-0.5 md:row-span-1 md:pt-0">
                      {selectable ? (
                        <Checkbox aria-label={tr('انتخاب')} checked={selected.has(t.id)} onCheckedChange={(v) => toggle(t.id, v === true)} />
                      ) : <span className="w-4" />}
                    </span>
                    {/* ⚠️ data-tour روی عنوان، نه کلِ ردیف: وسطِ ردیف دکمهٔ وضعیت است و کلیکِ کاربر (به گفتهٔ راهنما
                        «روی تسک بزنید») منوی وضعیت را باز می‌کرد، نه پنجرهٔ تسک را. */}
                    <span data-tour="tasks-row" className="flex min-w-0 items-center gap-1.5">
                      <TaskNumber number={t.number} />
                      {t.isPrivate && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
                      <span className={cn('min-w-0 truncate text-sm font-medium', t.statusGroup === 'complete' && 'text-muted-foreground line-through')}>{t.title}</span>
                      {(t.notesCount ?? 0) > 0 && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><MessageSquare className="size-3" /><span className="num">{t.notesCount}</span></span>
                      )}
                      {(t.mediaCount ?? 0) > 0 && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><Paperclip className="size-3" /><span className="num">{t.mediaCount}</span></span>
                      )}
                      <span data-stop className="ms-auto shrink-0 md:hidden">{renderClaim(t)}</span>
                    </span>
                    {/* روی گوشی کنترل‌ها زیرِ عنوان در یک ردیفِ شکستنی؛ از md ستون‌های هم‌تراز. */}
                    <span data-stop className="col-start-2 flex flex-wrap items-center gap-2 md:contents">
                      <span className="md:justify-self-start">
                        <TaskStatusPicker task={t} options={statuses} canManage={canStatus && statuses.length > 0 && t.canSetStatus !== false} />
                      </span>
                      <span>
                        {canEdit && options ? (
                          <NativeSelect
                            size="sm" aria-label={tr('اولویت')} className="h-7 text-xs" containerClassName="w-full min-w-28"
                            value={t.priorityTagId ?? ''} disabled={m.pending}
                            onChange={(e) => m.patch([t.id], { priorityTagId: e.target.value ? Number(e.target.value) : null })}
                          >
                            <NativeSelectOption value="">{tr('— اولویت —')}</NativeSelectOption>
                            {options.priorities.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
                          </NativeSelect>
                        ) : t.priorityName ? <TagChip color={t.priorityColor}>{t.priorityName}</TagChip> : <span className="text-xs text-muted-foreground">—</span>}
                      </span>
                      <span className="min-w-0">
                        {canEdit && options && options.assignees.length > 0 ? (
                          <NativeSelect
                            size="sm" aria-label={tr('مسئول')} className="h-7 text-xs" containerClassName="w-full min-w-32"
                            value={t.assignedTo ?? ''} disabled={m.pending}
                            onChange={(e) => m.patch([t.id], { assignedTo: e.target.value ? Number(e.target.value) : null })}
                          >
                            <NativeSelectOption value="">{t.roles.length > 0 ? tr('— نقشی —') : tr('— بی‌مسئول —')}</NativeSelectOption>
                            {options.assignees.map((a) => <NativeSelectOption key={a.userId} value={a.userId}>{a.label}</NativeSelectOption>)}
                          </NativeSelect>
                        ) : <AssigneeText task={t} short />}
                      </span>
                      <span>
                        {canEdit ? (
                          <DatePicker
                            size="sm" className="h-7 w-full min-w-32 text-xs" aria-label={tr('ددلاین')}
                            value={t.dueDate ?? ''} disabled={m.pending}
                            onChange={(v) => m.patch([t.id], { dueDate: v || null })}
                          />
                        ) : t.dueDate ? (
                          <span className="num flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3" />{t.dueDate}</span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </span>
                    </span>
                    <span data-stop className="hidden md:col-span-full md:block md:empty:hidden">{renderClaim(t)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* نوارِ تغییرِ گروهی — بالای منوی پایینِ گوشی، وسطِ صفحه روی رایانه. */}
      {ids.length > 0 && (
        <div
          role="toolbar"
          aria-label={tr('تغییرِ گروهی')}
          className="fixed inset-x-3 bottom-24 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border bg-popover p-2 shadow-lg md:bottom-5"
        >
          <span className="px-2 text-sm font-medium">{tr('{n} انتخاب', { n: ids.length })}</span>
          {canStatus && statuses.length > 0 && (
            <NativeSelect size="sm" aria-label={tr('وضعیت')} className="h-8 text-xs" containerClassName="w-36" value="" disabled={m.pending}
              onChange={(e) => { if (e.target.value) m.status(ids, Number(e.target.value)); }}>
              <NativeSelectOption value="">{tr('وضعیت…')}</NativeSelectOption>
              {statuses.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}
            </NativeSelect>
          )}
          {canEdit && options && (
            <>
              <NativeSelect size="sm" aria-label={tr('اولویت')} className="h-8 text-xs" containerClassName="w-32" value="" disabled={m.pending}
                onChange={(e) => { if (e.target.value) m.patch(ids, { priorityTagId: e.target.value === 'none' ? null : Number(e.target.value) }); }}>
                <NativeSelectOption value="">{tr('اولویت…')}</NativeSelectOption>
                {options.priorities.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
                <NativeSelectOption value="none">{tr('— بدونِ اولویت —')}</NativeSelectOption>
              </NativeSelect>
              {options.assignees.length > 0 && (
                <NativeSelect size="sm" aria-label={tr('مسئول')} className="h-8 text-xs" containerClassName="w-36" value="" disabled={m.pending}
                  onChange={(e) => { if (e.target.value) m.patch(ids, { assignedTo: e.target.value === 'none' ? null : Number(e.target.value) }); }}>
                  <NativeSelectOption value="">{tr('مسئول…')}</NativeSelectOption>
                  {options.assignees.map((a) => <NativeSelectOption key={a.userId} value={a.userId}>{a.label}</NativeSelectOption>)}
                  <NativeSelectOption value="none">{tr('— بی‌مسئول —')}</NativeSelectOption>
                </NativeSelect>
              )}
              <DatePicker size="sm" className="h-8 w-36 text-xs" aria-label={tr('ددلاین')} value="" disabled={m.pending}
                onChange={(v) => { if (v) m.patch(ids, { dueDate: v }); }} placeholder={tr('ددلاین…')} />
            </>
          )}
          <Button type="button" size="sm" variant="ghost" className="ms-auto" onClick={() => setSelected(new Set())}>
            <X className="size-4" />{tr('لغوِ انتخاب')}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * برد
 * ------------------------------------------------------------------ */

export function TaskBoardView({
  projectId, tasks, statuses, options, groupBy, canEdit, canStatus, onOpen,
}: {
  projectId: number;
  tasks: TaskItem[];
  statuses: TaskStatusOption[];
  options: TaskFormOptions | null;
  groupBy: GroupBy;
  canEdit: boolean;
  canStatus: boolean;
  onOpen: (id: number) => void;
}) {
  const tr = useT();
  const m = useTaskMutations();
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [collapsed, setCollapsed] = usePersisted<string[]>(`kz-board-collapsed-${projectId}-${groupBy}`, []);
  const [hideEmpty, setHideEmpty] = usePersisted<boolean>('kz-board-hide-empty', true);

  const all = buildGroups(tasks, groupBy, statuses, options, tr);
  const groups = hideEmpty ? all.filter((g) => g.tasks.length > 0) : all;
  const emptyCount = all.length - all.filter((g) => g.tasks.length > 0).length;
  // کشیدن: وضعیت/مرحله برای هر کس که وضعیت عوض می‌کند؛ اولویت/مسئول فقط ویرایشگر.
  const canDrop = (g: Group) => !!g.drop && (g.drop.kind === 'status' ? canStatus : canEdit);
  const canDrag = groupBy === 'status' || groupBy === 'stage' ? canStatus : canEdit;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {canDrag && <span>{tr('کارت را بکشید و در ستونِ دیگر رها کنید تا {field} عوض شود.', { field: tr(GROUP_BY_LABELS[groupBy]) })}</span>}
        {emptyCount > 0 && (
          <label className="ms-auto flex items-center gap-1.5">
            <Checkbox checked={hideEmpty} onCheckedChange={(v) => setHideEmpty(v === true)} />
            {tr('پنهان‌کردنِ ستون‌های خالی ({n})', { n: emptyCount })}
          </label>
        )}
      </div>
      {/* ⚠️ اسکرولِ افقی فقط داخلِ تخته؛ هر ستون ارتفاعِ محدود و پیمایشِ خودش را دارد — صفحه دیگر دراز نمی‌شود. */}
      <div className="flex items-start gap-3 overflow-x-auto overscroll-x-contain pb-2">
        {groups.map((g) => {
          const isCollapsed = collapsed.includes(g.key);
          const toggle = () => setCollapsed(isCollapsed ? collapsed.filter((k) => k !== g.key) : [...collapsed, g.key]);
          const droppable = canDrop(g);
          if (isCollapsed) {
            return (
              <button
                key={g.key} type="button" onClick={toggle}
                onDragOver={(e) => { if (droppable && dragging) { e.preventDefault(); setOver(g.key); } }}
                onDragLeave={() => setOver((o) => (o === g.key ? null : o))}
                onDrop={(e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData('text/plain')); if (id && g.drop) m.apply([id], g.drop); }}
                className={cn('flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg border-t-4 bg-muted/60 py-2 text-xs font-medium hover:bg-muted', over === g.key && 'ring-2 ring-primary/40')}
                style={{ borderTopColor: g.color || 'var(--color-primary)' }}
                aria-label={tr('بازکردنِ ستونِ {name}', { name: g.label })}
              >
                <span className="num text-muted-foreground">{g.tasks.length}</span>
                <span className="[writing-mode:vertical-rl]">{g.label}</span>
              </button>
            );
          }
          return (
            <section
              key={g.key}
              onDragOver={(e) => { if (droppable && dragging) { e.preventDefault(); setOver(g.key); } }}
              onDragLeave={() => setOver((o) => (o === g.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData('text/plain')); if (id && g.drop) m.apply([id], g.drop); }}
              className={cn('flex w-64 shrink-0 flex-col rounded-lg border-t-4 bg-muted/60', over === g.key && 'ring-2 ring-primary/40')}
              style={{ borderTopColor: g.color || 'var(--color-primary)' }}
            >
              <header className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs font-medium">
                <span className="truncate">{g.label}</span>
                <span className="flex items-center gap-1">
                  <span className="num text-muted-foreground">{g.tasks.length}</span>
                  <Button type="button" size="icon-xs" variant="ghost" onClick={toggle} aria-label={tr('جمع‌کردنِ ستون')} className="text-muted-foreground">
                    <ChevronDown className="size-3.5 ltr:-rotate-90 rtl:rotate-90" />
                  </Button>
                </span>
              </header>
              <div className="grid max-h-[calc(100svh-17rem)] min-h-16 content-start gap-1.5 overflow-y-auto overscroll-y-contain p-1.5 pt-0">
                {g.tasks.map((t) => (
                  <article
                    key={t.id}
                    data-tour="tasks-item"
                    draggable={canDrag && (groupBy === 'status' || groupBy === 'stage' ? t.canSetStatus !== false : true)}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(t.id)); e.dataTransfer.effectAllowed = 'move'; setDragging(t.id); }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-stop]')) onOpen(t.id); }}
                    className={cn(
                      'grid cursor-pointer gap-1 rounded-lg border bg-card p-2 text-[13px] shadow-xs transition-colors hover:border-primary/40',
                      canDrag && 'active:cursor-grabbing',
                      (dragging === t.id || m.pending) && 'opacity-60',
                    )}
                  >
                    <div data-tour="tasks-row" className="flex items-start gap-1.5">
                      <TaskNumber number={t.number} className="mt-0.5" />
                      {t.isPrivate && <Lock className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
                      <span className="line-clamp-2 min-w-0 flex-1 font-medium">{t.title}</span>
                      {(canEdit || canStatus) && (
                        <CardMenu task={t} statuses={statuses} options={options} canEdit={canEdit} canStatus={canStatus && t.canSetStatus !== false} m={m} />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      {groupBy !== 'priority' && t.priorityName && <TagChip color={t.priorityColor}>{t.priorityName}</TagChip>}
                      {groupBy !== 'status' && groupBy !== 'stage' && t.statusName && <TagChip color={t.statusColor}>{t.statusName}</TagChip>}
                      {t.dueDate && <span className="num flex items-center gap-0.5"><CalendarDays className="size-3" />{t.dueDate}</span>}
                      {(t.notesCount ?? 0) > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="size-3" /><span className="num">{t.notesCount}</span></span>}
                      {(t.mediaCount ?? 0) > 0 && <span className="flex items-center gap-0.5"><Paperclip className="size-3" /><span className="num">{t.mediaCount}</span></span>}
                    </div>
                    {groupBy !== 'assignee' && <AssigneeText task={t} short />}
                  </article>
                ))}
                {g.tasks.length === 0 && <p className="px-1 py-2 text-center text-xs text-muted-foreground">{tr('خالی')}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** منوی سریعِ کارتِ برد — وضعیت، اولویت، مسئول بی بازکردنِ تسک؛ روی لمس جایگزینِ کشیدن هم هست. */
function CardMenu({
  task, statuses, options, canEdit, canStatus, m,
}: {
  task: TaskItem;
  statuses: TaskStatusOption[];
  options: TaskFormOptions | null;
  canEdit: boolean;
  canStatus: boolean;
  m: ReturnType<typeof useTaskMutations>;
}) {
  const tr = useT();
  return (
    <span data-stop>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon-xs" variant="ghost" aria-label={tr('کارهای سریع')} className="-mt-0.5 shrink-0 text-muted-foreground">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canStatus && statuses.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{tr('وضعیت')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                <DropdownMenuRadioGroup value={String(task.statusTagId ?? '')} onValueChange={(v) => m.status([task.id], Number(v))}>
                  {statuses.map((s) => <DropdownMenuRadioItem key={s.id} value={String(s.id)}>{s.name}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {canEdit && options && (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{tr('اولویت')}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={String(task.priorityTagId ?? '')} onValueChange={(v) => m.patch([task.id], { priorityTagId: v ? Number(v) : null })}>
                    {options.priorities.map((p) => <DropdownMenuRadioItem key={p.id} value={String(p.id)}>{p.name}</DropdownMenuRadioItem>)}
                    <DropdownMenuRadioItem value="">{tr('بدونِ اولویت')}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {options.assignees.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>{tr('مسئول')}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                    <DropdownMenuRadioGroup value={String(task.assignedTo ?? '')} onValueChange={(v) => m.patch([task.id], { assignedTo: v ? Number(v) : null })}>
                      {options.assignees.map((a) => <DropdownMenuRadioItem key={a.userId} value={String(a.userId)}>{a.label}</DropdownMenuRadioItem>)}
                      <DropdownMenuRadioItem value="">{tr('بی‌مسئول')}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {task.dueDate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{tr('ددلاین {date}', { date: task.dueDate })}</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => m.patch([task.id], { dueDate: null })}>{tr('برداشتنِ ددلاین')}</DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
