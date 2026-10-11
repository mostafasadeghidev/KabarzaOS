'use client';

import { useState } from 'react';
import Link from 'next/link';
import { hoursLabel } from '@/domain/timelogs/timer';
import { TAB_LABELS } from '@/domain/projects/tabs';
import {
  BOARD_PER_PAGE, DEFAULT_PER_PAGE, groupTabs, inGroup, paginate, type ProjectBoardGroup,
} from '@/domain/team/boards';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Pager } from '@/components/ui/pager';
import { Progress } from '@/components/ui/progress';
import { ProjectStatus } from '@/app/(app)/projects/project-status';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';

export interface BoardProject {
  id: number;
  title: string;
  isArchived: boolean;
  statusName: string | null;
  statusGroup: string | null;
  statusColor: string | null;
  progress: number;
  minutes: number;
  /** حالتِ «manage». */
  officeName?: string | null;
  regDate?: string | null;
  taskTotal?: number;
  /** حالتِ «member» — نقش‌ها و تسک‌های بازِ همان عضو. */
  roles?: string[];
  openTasks?: number;
}

/**
 * بردِ پروژه — پورتِ `render_projects_board`: تبِ «همه» + هر گروهِ وضعیتی
 * که پروژه دارد (با شمارش)، و صفحه‌بندی با انتخابِ تعداد.
 *
 * `mode`:
 *   `manage` — ستون‌های `managed_projects_table` (دفتر، تاریخ، تعدادِ تسک، پیشرفت، زمانِ کل).
 *   `member` — ستون‌های `member_monitor_projects_table` (نقش، پیشرفت، ساعت و تسکِ بازِ همان عضو).
 * هیچ‌کدام پول ندارد.
 */
export function ProjectBoard({
  mode,
  projects,
  empty,
  action,
}: {
  mode: 'manage' | 'member';
  projects: BoardProject[];
  empty: string;
  action?: React.ReactNode;
}) {
  const tr = useT();
  const [group, setGroup] = useState<ProjectBoardGroup | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(DEFAULT_PER_PAGE);

  const tabs = groupTabs(projects);
  const list = projects.filter((p) => inGroup(p, group));
  const pg = paginate(list, page, perPage);

  const pick = (value: string) => {
    setGroup(value === 'all' ? null : value as ProjectBoardGroup);
    setPage(1);
  };

  return (
    <div className="grid gap-3">
      {action && <div className="flex justify-end">{action}</div>}

      {projects.length === 0 ? <EmptyState title={empty} /> : (
        <>
          {/* فیلترِ یک فهرست → تبِ قرصی (DESIGN.md). */}
          <div className="overflow-x-auto pb-1.5">
            <Tabs value={group ?? 'all'} onValueChange={pick}>
              <TabsList className="w-max">
                <TabsTrigger value="all" className="flex-none gap-1.5 px-3">
                  {tr('همه')}
                  <span className="num text-xs text-muted-foreground">{tabs.all}</span>
                </TabsTrigger>
                {tabs.groups.map((g) => (
                  <TabsTrigger key={g.key} value={g.key} className="flex-none gap-1.5 px-3">
                    {tr(TAB_LABELS[g.key])}
                    <span className="num text-xs text-muted-foreground">{g.count}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {pg.items.length === 0 ? <p className="text-sm text-muted-foreground">{tr('پروژه‌ای نیست.')}</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('نام')}</TableHead>
                  {mode === 'manage' ? (
                    <>
                      <TableHead>{tr('دفتر')}</TableHead>
                      <TableHead numeric>{tr('تاریخ')}</TableHead>
                    </>
                  ) : <TableHead>{tr('نقش')}</TableHead>}
                  <TableHead>{tr('وضعیت پروژه')}</TableHead>
                  {mode === 'manage' && <TableHead numeric>{tr('تعداد تسک‌ها')}</TableHead>}
                  <TableHead>{tr('درصد پیشرفت')}</TableHead>
                  <TableHead numeric>{mode === 'manage' ? tr('زمان کل کار') : tr('ساعت کاری')}</TableHead>
                  {mode === 'member' && <TableHead numeric>{tr('تسک باز')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pg.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                      {p.isArchived && <Badge variant="secondary" className="ms-2">{tr('بایگانی')}</Badge>}
                    </TableCell>
                    {mode === 'manage' ? (
                      <>
                        <TableCell>{p.officeName ?? '—'}</TableCell>
                        <TableNumericCell>{p.regDate ?? '—'}</TableNumericCell>
                      </>
                    ) : <TableCell>{p.roles && p.roles.length > 0 ? p.roles.join('، ') : '—'}</TableCell>}
                    <TableCell>
                      <ProjectStatus name={p.statusName} group={p.statusGroup} color={p.statusColor} />
                    </TableCell>
                    {mode === 'manage' && <TableNumericCell>{p.taskTotal ?? 0}</TableNumericCell>}
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Progress value={p.progress} className="w-20" aria-label={tr('درصد پیشرفت')} />
                        <span className="num text-xs">{p.progress}%</span>
                      </span>
                    </TableCell>
                    <TableNumericCell>{hoursLabel(p.minutes)}</TableNumericCell>
                    {mode === 'member' && <TableNumericCell>{p.openTasks ?? 0}</TableNumericCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Pager
            page={pg.page}
            totalPages={pg.totalPages}
            total={pg.total}
            perPage={perPage}
            onPage={setPage}
            perPageOptions={pg.total > 10 ? BOARD_PER_PAGE : undefined}
            onPerPage={(n) => { setPerPage(n); setPage(1); }}
          />
        </>
      )}
    </div>
  );
}
