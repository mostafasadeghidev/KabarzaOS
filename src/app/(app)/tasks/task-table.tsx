'use client';

import { UserName } from '@/components/user-avatar';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Lock, MessageSquare } from 'lucide-react';
import type { InboxTask } from '@/server/projects/service';
import { Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableDateCell, TableNumericCell, TableRow } from '@/components/ui/table';
import { useT } from '@/i18n/client';
import { ClaimTaskButton } from './inbox-claim';
import { TaskDialog } from '../projects/[id]/task-dialog';
import { NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SearchInput } from '@/components/ui/search-input';
import { TagChip } from '@/components/ui/tag-chip';
import { TaskNumber } from '@/components/task-number';
import { latinDigits, parseTaskRef, projectCodeOf } from '@/domain/projects/task-ref';

/**
 * فهرستِ تسک‌های صندوق — **جدول**، نه ردیفِ درهم.
 *
 * ⚠️ چرا جدول: پیش از این هر تسک یک `flex-wrap` بود و چیپ‌ها هرجا که جا
 * داشتند می‌نشستند؛ در فهرستِ ده‌تایی هیچ ستونی زیرِ هم نبود و چشم باید هر
 * سطر را از نو می‌خواند. ستون‌ها ثابت‌اند: تسک · اولویت · وضعیت · مسئول ·
 * پروژه · ددلاین · کنش.
 *
 * ⚠️ کلیک روی عنوان **مودال** باز می‌کند، نه پیمایش به پروژه: کاربر اغلب
 * می‌خواهد یک نگاهِ سریع بیندازد و برگردد؛ رفتن به صفحهٔ پروژه او را از
 * صندوقش بیرون می‌بُرد و برگشتن یعنی از نو پیدا کردنِ جای خودش. رفتن به
 * پروژه در همان مودال یک دکمه است، و نامِ پروژه در ستونِ خودش هم لینک است.
 */
export function TaskTable({
  rows,
  empty,
  filterable = false,
  showAssignee = true,
}: {
  rows: InboxTask[];
  empty: string;
  /** فیلترِ جستجو و پروژه — برای فهرستِ بلندِ «تسک‌های جاری». */
  filterable?: boolean;
  /** ستونِ «مسئول» — صندوقِ کارفرما ندارد. */
  showAssignee?: boolean;
}) {
  const t = useT();
  const tr = useT();
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState<string>('');

  /** پروژه‌های همین فهرست — گزینه‌های انتخابگر. */
  const projects = useMemo(() => {
    const byId = new Map<number, string>();
    for (const r of rows) if (!byId.has(r.projectId)) byId.set(r.projectId, r.projectTitle ?? `#${r.projectId}`);
    return [...byId].map(([id, title]) => ({ id, title }));
  }, [rows]);

  const visible = useMemo(() => {
    const needle = latinDigits(query.trim()).toLowerCase();
    // «ALZ-325»/«#325»/«325» (۲.۱۶.۰) ← دقیقاً همان تسک، نه هر سطری که «325» دارد.
    const ref = parseTaskRef(needle);
    return rows.filter((r) => {
      if (projectId !== '' && String(r.projectId) !== projectId) return false;
      if (needle === '') return true;
      if (ref && r.number) {
        if (ref.kind === 'local') return r.number === ref.number;
        return r.number === ref.number && projectCodeOf({ id: r.projectId, code: r.projectCode }) === ref.code;
      }
      // جستجو روی همان چیزهایی که در سطر دیده می‌شوند.
      return [
        r.title, r.projectTitle ?? '', r.statusName ?? '', r.priorityName ?? '', r.assigneeName ?? '',
        ...r.roles.flatMap((role) => [role.roleName ?? '', role.claimedByName ?? '']),
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [rows, query, projectId]);

  if (rows.length === 0) {
    // ⚠️ بی‌حاشیه: جدول داخلِ `Panel` می‌نشیند که خودش حاشیه دارد.
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <>
      {filterable && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr('جستجو در تسک‌ها…')}
          />
          {/* انتخابِ پروژه — وقتی بیش از یک پروژه در فهرست باشد معنا دارد. */}
          {projects.length > 1 && (
            <SearchableSelect
              size="sm"
              containerClassName="w-full sm:w-44"
              value={projectId}
              onValueChange={(v) => setProjectId(v)}
            >
              <NativeSelectOption value="">{t('همهٔ پروژه‌ها')}</NativeSelectOption>
              {projects.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>{p.title}</NativeSelectOption>
              ))}
            </SearchableSelect>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {tr('{n} تسک', { n: visible.length })}
          </span>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('نتیجه‌ای نیست.')}</p>
      ) : (
        <Table frame={false}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("تسک")}</TableHead>
              <TableHead>{t("اولویت")}</TableHead>
              <TableHead>{t("وضعیت")}</TableHead>
              {showAssignee && <TableHead>{t("مسئول")}</TableHead>}
              <TableHead>{t("پروژه")}</TableHead>
              <TableHead>{t("ددلاین")}</TableHead>
              <TableActionsHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((task) => (
              /**
               * ⚠️ **کلِ سطر** باز می‌شود، نه فقط عنوان: هدفِ کلیک به اندازهٔ
               * یک خطِ متن بود و کاربر روی ستونِ وضعیت یا پروژه کلیک می‌کرد و
               * هیچ اتفاقی نمی‌افتاد. نشانگر هم `pointer` می‌شود تا معلوم باشد
               * سطر کلیک‌پذیر است.
               */
              <TableRow
                key={task.id}
                onClick={() => setOpenTask(task.id)}
                className="cursor-pointer"
              >
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    {/* پورتِ چیپِ 🔒 «خصوصی». */}
                    {task.isPrivate && (
                      <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('خصوصی')} />
                    )}
                    <TaskNumber number={task.number} code={projectCodeOf({ id: task.projectId, code: task.projectCode })} />
                    <span className="font-medium">{task.title}</span>
                  </span>
                  {/* پورتِ `task_notes_summary`: شمار و آخرین یادداشت — بی‌بازکردنِ تسک معلوم شود گفتگو کجاست. */}
                  {task.notesCount > 0 && (
                    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="size-3 shrink-0" aria-hidden />
                      <span className="num">{task.notesCount}</span>
                      {task.lastNote && <span className="truncate">· {task.lastNote}</span>}
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  {task.priorityName
                    ? <TagChip color={task.priorityColor}>{task.priorityName}</TagChip>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>

                <TableCell>
                  {task.statusName
                    ? (
                      <TagChip color={task.statusColor}>{task.statusName}</TagChip>
                    )
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>

                {/*
                  ⚠️ ستونِ «مسئول» (۲.۵۷.۱): پیش از این فقط «👤 به نامِ شما» و
                  نقش‌ها زیرِ عنوان می‌آمد، پس در «فرستاده‌شده برای بررسیِ شما»
                  — جایی که تسک مالِ دیگری است — معلوم نبود کارِ چه کسی است.
                  کارفرما این ستون را نمی‌بیند؛ نامِ اعضا برای او ماسک است.
                */}
                {showAssignee && (
                  <TableCell>
                    <Assignee task={task} />
                  </TableCell>
                )}

                {/* ⚠️ لینک و دکمه کارِ خودشان را می‌کنند، نه بازکردنِ مودال. */}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Link
                    href={`/projects/${task.projectId}?tab=tasks&view=${task.isReview ? 'review' : 'cur'}`}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {task.projectTitle}
                  </Link>
                </TableCell>
                <TableDateCell className="text-muted-foreground">{task.dueDate ?? '—'}</TableDateCell>

                <TableActionsCell onClick={(e) => e.stopPropagation()}>
                  {task.claimable && <ClaimTaskButton taskId={task.id} projectId={task.projectId} />}
                </TableActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* نگاهِ سریع — همان مودالِ صفحهٔ پروژه، با دکمهٔ رفتن به پروژه. */}
      <TaskDialog
        taskId={openTask}
        open={openTask !== null}
        onOpenChange={(o) => !o && setOpenTask(null)}
      />
    </>
  );
}

/**
 * خانهٔ «مسئول»: مسئولِ مستقیم، وگرنه نقش‌های تسک با نامِ برداشته‌اش.
 * «شما» به‌جای نامِ خودِ بیننده — پورتِ آیتمِ 👤 ِ ردیفِ صندوق.
 */
function Assignee({ task }: { task: InboxTask }) {
  const t = useT();
  if (task.mine) return <span>{t('شما')}</span>;
  if (task.assigneeName) return <UserName userId={task.assignedTo} name={task.assigneeName} />;
  if (task.roles.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {task.roles.map((r, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {r.claimedByName
            ? <UserName userId={r.claimedBy} name={r.claimedByName} />
            : r.claimedBy !== null ? t('شما') : null}
          <span className="text-xs text-muted-foreground">{r.roleName ?? ''}</span>
        </span>
      ))}
    </span>
  );
}
