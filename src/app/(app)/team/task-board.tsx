'use client';

import { UserName, avatarFor } from '@/components/user-avatar';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { BOARD_PER_PAGE } from '@/domain/team/boards';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select';
import { Pager } from '@/components/ui/pager';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TagChip } from '@/components/ui/tag-chip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';
import { TaskDialog } from '../projects/[id]/task-dialog';

export interface BoardTask {
  id: number;
  title: string;
  projectId: number;
  projectTitle: string | null;
  dueDate: string | null;
  /** مسئولِ مستقیم — برای آواتار. */
  assigneeId?: number | null;
  assigneeName: string | null;
  roleNames: string[];
  statusName: string | null;
  statusColor: string | null;
  priorityName?: string | null;
  priorityColor?: string | null;
}

export interface TaskBoardData {
  rows: BoardTask[];
  /** فیلترِ «کارهای این عضو» (`m:`) — نامش برای انتخابگر. */
  forMember: { id: number; name: string } | null;
  total: number;
  allCount: number;
  statusCounts: Array<{ id: number; name: string; color: string; n: number }>;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface TaskBoardOptions {
  priorities: Array<{ id: number; name: string }>;
  assignees: Array<{ id: number; name: string }>;
  roles: Array<{ id: number; name: string }>;
}

/** «برای چه کسی» — پورتِ `task_assignee_text`: نفر و/یا نقش‌ها. */
export function assigneeText(task: Pick<BoardTask, 'assigneeName' | 'roleNames'>): string {
  const parts = [task.assigneeName, ...task.roleNames].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join('، ') : '—';
}

/** «برای چه کسی» با آواتارِ مسئولِ مستقیم؛ نقش‌ها پس از نام. */
export function Assignee({ task }: { task: Pick<BoardTask, 'assigneeId' | 'assigneeName' | 'roleNames'> }) {
  if (!task.assigneeName) return <>{assigneeText(task)}</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <UserName userId={task.assigneeId} name={task.assigneeName} />
      {task.roleNames.length > 0 && <span className="text-muted-foreground">، {task.roleNames.join('، ')}</span>}
    </span>
  );
}

/** عنوانِ تسک که مودالِ خودش را باز می‌کند — همان `kteam-task-open`. */
export function TaskTitleButton({ task, onOpen }: { task: Pick<BoardTask, 'id' | 'title'>; onOpen: (id: number) => void }) {
  return (
    <button
      type="button"
      className="text-start font-medium hover:underline focus-visible:underline focus-visible:outline-none"
      onClick={() => onOpen(task.id)}
    >
      {task.title}
    </button>
  );
}

/**
 * بردِ تسک‌های تیم — پورتِ `render_task_board`:
 * تب‌های وضعیت با شمارش (درونِ فیلترهای دیگر) ← فیلترِ عضو/نقش، اولویت،
 * ددلاین ← جدول با مودالِ تسک ← صفحه‌بندی با انتخابِ تعداد.
 *
 * ⚠️ همه‌چیز در **آدرس** است: مدیرِ دفتر همین لینک را برای کسی می‌فرستد
 * («این‌ها را ببین») و state ِ کلاینت قابلِ اشتراک نیست.
 */
export function TaskBoard({ board, options }: { board: TaskBoardData; options: TaskBoardOptions }) {
  const tr = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [openId, setOpenId] = useState<number | null>(null);

  const value = (key: string) => params.get(key) ?? '';
  const hasFilter = ['tassignee', 'tprio', 'tdue'].some((k) => value(k) !== '');

  const hrefWith = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', 'tasks');
    for (const [k, v] of Object.entries(changes)) {
      if (v === '') next.delete(k);
      else next.set(k, v);
    }
    // هر تغییری جز خودِ صفحه، به صفحهٔ اول برمی‌گردد.
    if (!('tpage' in changes)) next.delete('tpage');
    return `/team?${next.toString()}`;
  };
  const go = (changes: Record<string, string>) => router.push(hrefWith(changes));

  return (
    <div className="grid gap-3">
      {/* تب‌های وضعیت — شمارش درونِ فیلترهای دیگر (همان `$pre` ِ نسخهٔ قبلی). */}
      <div className="overflow-x-auto pb-1.5">
        <Tabs value={value('tstatus') || 'all'} onValueChange={(v) => go({ tstatus: v === 'all' ? '' : v })}>
          <TabsList className="w-max">
            <TabsTrigger value="all" className="flex-none gap-1.5 px-3">
              {tr('همه')}
              <span className="num text-xs text-muted-foreground">{board.allCount}</span>
            </TabsTrigger>
            {board.statusCounts.map((s) => (
              <TabsTrigger key={s.id} value={String(s.id)} className="flex-none gap-1.5 px-3">
                {s.name}
                <span className="num text-xs text-muted-foreground">{s.n}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect
          size="sm"
          containerClassName="w-full sm:w-52"
          value={value('tassignee')}
          onValueChange={(v) => go({ tassignee: v })}
          aria-label={tr('عضو / نقش')}
          renderMedia={(v) => (v.startsWith('m:') && board.forMember
            ? avatarFor([board.forMember], 'm:')(v)
            : avatarFor(options.assignees, 'u:')(v))}
        >
          <NativeSelectOption value="">{tr('همهٔ اعضا و نقش‌ها')}</NativeSelectOption>
          {/* ⚠️ صفر معنایش «بدونِ مسئول» است، نه «همه». */}
          <NativeSelectOption value="0">{tr('بدونِ مسئول')}</NativeSelectOption>
          {board.forMember && (
            <NativeSelectOption value={`m:${board.forMember.id}`}>
              {tr('کارهای {name}', { name: board.forMember.name })}
            </NativeSelectOption>
          )}
          {options.assignees.length > 0 && (
            <NativeSelectOptGroup label={tr('اعضا')}>
              {options.assignees.map((a) => <NativeSelectOption key={a.id} value={`u:${a.id}`}>{a.name}</NativeSelectOption>)}
            </NativeSelectOptGroup>
          )}
          {options.roles.length > 0 && (
            <NativeSelectOptGroup label={tr('نقش‌ها')}>
              {options.roles.map((r) => <NativeSelectOption key={r.id} value={`r:${r.id}`}>{r.name}</NativeSelectOption>)}
            </NativeSelectOptGroup>
          )}
        </SearchableSelect>

        <NativeSelect
          size="sm"
          containerClassName="w-full sm:w-40"
          value={value('tprio')}
          onChange={(e) => go({ tprio: e.target.value })}
          aria-label={tr('اولویت')}
        >
          <NativeSelectOption value="">{tr('همهٔ اولویت‌ها')}</NativeSelectOption>
          {options.priorities.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
        </NativeSelect>

        <NativeSelect
          size="sm"
          containerClassName="w-full sm:w-40"
          value={value('tdue')}
          onChange={(e) => go({ tdue: e.target.value })}
          aria-label={tr('ددلاین')}
        >
          <NativeSelectOption value="">{tr('هر ددلاینی')}</NativeSelectOption>
          <NativeSelectOption value="overdue">{tr('گذشته')}</NativeSelectOption>
          <NativeSelectOption value="today">{tr('امروز')}</NativeSelectOption>
          <NativeSelectOption value="week">{tr('هفتهٔ آینده')}</NativeSelectOption>
          <NativeSelectOption value="none">{tr('بدونِ ددلاین')}</NativeSelectOption>
        </NativeSelect>

        {/*
          ⚠️ بردِ نسخهٔ قبلی فقط تسک‌های باز را داشت (نه بسته، نه ریویو) و پیش‌فرض
          همین است؛ این تیک بسته‌ها و ریویوها را هم می‌آورد، همان چیزی که
          این بخش پیش از این همیشه نشان می‌داد.
        */}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value('tall') === '1'}
            onCheckedChange={(v) => go({ tall: v === true ? '1' : '', tstatus: '' })}
          />
          {tr('بسته‌ها و ریویوها هم')}
        </label>

        {hasFilter && (
          <Button
            type="button" size="sm" variant="ghost" className="gap-1.5"
            onClick={() => go({ tassignee: '', tprio: '', tdue: '' })}
          >
            <X className="size-3.5" />
            {tr('حذف فیلترها')}
          </Button>
        )}
      </div>

      {board.rows.length === 0 ? <EmptyState title={tr('موردی یافت نشد.')} /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('تسک')}</TableHead>
              <TableHead>{tr('پروژه')}</TableHead>
              <TableHead>{tr('تخصیص')}</TableHead>
              <TableHead>{tr('اولویت')}</TableHead>
              <TableHead numeric>{tr('ددلاین')}</TableHead>
              <TableHead>{tr('وضعیت')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {board.rows.map((task) => (
              <TableRow key={task.id}>
                <TableCell><TaskTitleButton task={task} onOpen={setOpenId} /></TableCell>
                <TableCell>
                  <Link href={`/projects/${task.projectId}`} className="hover:underline">{task.projectTitle ?? '—'}</Link>
                </TableCell>
                <TableCell><Assignee task={task} /></TableCell>
                <TableCell>
                  {task.priorityName ? <TagChip color={task.priorityColor}>{task.priorityName}</TagChip> : '—'}
                </TableCell>
                <TableNumericCell>{task.dueDate ?? '—'}</TableNumericCell>
                <TableCell>
                  {task.statusName ? <TagChip color={task.statusColor}>{task.statusName}</TagChip> : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pager
        page={board.page}
        totalPages={board.totalPages}
        total={board.total}
        perPage={board.perPage}
        hrefOf={(p) => hrefWith({ tpage: String(p) })}
        perPageOptions={board.total > 10 ? BOARD_PER_PAGE : undefined}
        onPerPage={(n) => go({ tper: String(n) })}
      />

      <TaskDialog
        taskId={openId}
        open={openId !== null}
        onOpenChange={(open) => { if (!open) { setOpenId(null); router.refresh(); } }}
      />
    </div>
  );
}
