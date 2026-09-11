'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Lock, Search } from 'lucide-react';
import type { InboxTask } from '@/server/projects/service';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { chipStyle } from '@/domain/ui/contrast';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';
import { ClaimTaskButton } from './inbox-claim';
import { TaskDialog } from '../projects/[id]/task-dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/**
 * فهرستِ تسک‌های صندوق — **جدول**، نه ردیفِ درهم.
 *
 * ⚠️ چرا جدول: پیش از این هر تسک یک `flex-wrap` بود و چیپ‌ها هرجا که جا
 * داشتند می‌نشستند؛ در فهرستِ ده‌تایی هیچ ستونی زیرِ هم نبود و چشم باید هر
 * سطر را از نو می‌خواند. ستون‌ها ثابت‌اند: تسک · اولویت · وضعیت · پروژه ·
 * ددلاین · کنش.
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
}: {
  rows: InboxTask[];
  empty: string;
  /** فیلترِ جستجو و پروژه — برای فهرستِ بلندِ «تسک‌های جاری». */
  filterable?: boolean;
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
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (projectId !== '' && String(r.projectId) !== projectId) return false;
      if (needle === '') return true;
      // جستجو روی همان چیزهایی که در سطر دیده می‌شوند.
      return [
        r.title, r.projectTitle ?? '', r.statusName ?? '', r.priorityName ?? '',
        ...r.roles.map((role) => role.roleName ?? ''),
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [rows, query, projectId]);

  if (rows.length === 0) {
    return <p className="px-4 pb-4 text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <>
      {filterable && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('جستجو در تسک‌ها…')}
              className="ps-9"
            />
          </div>
          {/* انتخابِ پروژه — وقتی بیش از یک پروژه در فهرست باشد معنا دارد. */}
          {projects.length > 1 && (
            <NativeSelect
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              
            >
              <NativeSelectOption value="">{t('همهٔ پروژه‌ها')}</NativeSelectOption>
              {projects.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>{p.title}</NativeSelectOption>
              ))}
            </NativeSelect>
          )}
          <span className="num text-xs text-muted-foreground">
            {tr('{n} تسک', { n: visible.length })}
          </span>
        </div>
      )}

      <div className="overflow-x-auto px-4 pb-4">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('نتیجه‌ای نیست.')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("تسک")}</TableHead>
                <TableHead>{t("اولویت")}</TableHead>
                <TableHead>{t("وضعیت")}</TableHead>
                <TableHead>{t("پروژه")}</TableHead>
                <TableHead className="text-end">{t("ددلاین")}</TableHead>
                <TableHead />
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
                      <span className="font-medium">{task.title}</span>
                    </span>
                    {/* نقش‌ها زیرِ عنوان می‌نشینند تا ستون‌ها به‌هم نریزند. */}
                    {task.roles.length > 0 && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {task.roles
                          .map((r) => (r.claimedByName ? `${r.roleName ?? ''} (${r.claimedByName})` : (r.roleName ?? '')))
                          .join(t('، '))}
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    {task.priorityName
                      ? <Badge variant="outline" style={chipStyle(task.priorityColor)}>{task.priorityName}</Badge>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  <TableCell>
                    {task.statusName
                      ? (
                        <Badge
                          variant={chipStyle(task.statusColor) ? 'outline' : 'secondary'}
                          style={chipStyle(task.statusColor)}
                        >
                          {task.statusName}
                        </Badge>
                      )
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>

                  {/* ⚠️ لینک و دکمه کارِ خودشان را می‌کنند، نه بازکردنِ مودال. */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/projects/${task.projectId}?tab=tasks&view=${task.isReview ? 'review' : 'cur'}`}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {task.projectTitle}
                    </Link>
                  </TableCell>
                  <TableNumericCell className="text-muted-foreground">{task.dueDate ?? '—'}</TableNumericCell>

                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {task.claimable && <ClaimTaskButton taskId={task.id} projectId={task.projectId} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* نگاهِ سریع — همان مودالِ صفحهٔ پروژه، با دکمهٔ رفتن به پروژه. */}
      <TaskDialog
        taskId={openTask}
        open={openTask !== null}
        onOpenChange={(o) => !o && setOpenTask(null)}
      />
    </>
  );
}
