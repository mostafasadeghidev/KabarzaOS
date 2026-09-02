'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { hoursLabel } from '@/domain/timelogs/timer';
import { RANGE_LABELS, type RangeKey } from '@/domain/access/office-scope';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT } from '@/i18n/client';
import { TaskFilter, type TaskFilterOptions, type TaskPaging } from './task-filter';

export interface TeamData {
  projects: Array<{
    id: number; title: string; deadline: string | null;
    isArchived: boolean; statusName: string | null;
  }>;
  tasks: Array<{
    id: number; title: string; projectId: number; projectTitle: string | null;
    dueDate: string | null; assigneeName: string | null;
    statusName: string | null; isReview: boolean | null;
  }>;
  /** همهٔ تسک‌های نیازمندِ بررسی — مستقل از فیلتر و صفحهٔ تبِ تسک‌ها. */
  reviewTasks: Array<{
    id: number; title: string; projectId: number; projectTitle: string | null;
    dueDate: string | null; assigneeName: string | null; statusName: string | null;
  }>;
  taskOptions: TaskFilterOptions;
  taskPaging: TaskPaging;
  comments: Array<{
    id: number; body: string; type: string; projectId: number | null;
    projectTitle: string | null; authorName: string | null;
  }>;
  members: Array<{ id: number; name: string; email: string; minutes: number }>;
  range: RangeKey;
}

const TABS = [
  { key: 'members', label: 'اعضا و ساعت کاری' },
  { key: 'projects', label: 'پروژه‌ها' },
  { key: 'tasks', label: 'تسک‌ها' },
  { key: 'review', label: 'نیازمند بررسی' },
] as const;

/**
 * «تیمِ من» — نمای مدیرِ دفتر.
 * ⚠️ عملیاتی است، نه مالی: هیچ مبلغی اینجا نیست.
 */
export function TeamView({ data }: { data: TeamData }) {
  const tr = useT();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('members');

  const review = data.reviewTasks;

  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tr(t.label)}
          </button>
        ))}
      </nav>

      {tab === 'members' && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* بازه با پیمایشِ صفحه عوض می‌شود تا لینک قابلِ اشتراک بماند. */}
            {(Object.keys(RANGE_LABELS) as RangeKey[]).filter((r) => r !== 'custom').map((r) => (
              <Link
                key={r}
                href={`/team?range=${r}`}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  data.range === r ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {tr(RANGE_LABELS[r])}
              </Link>
            ))}
            <a
              href={`/team/export?range=${data.range}`}
              className="ms-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Download className="size-3.5" />
              {tr("خروجی CSV")}
            </a>
          </div>

          {data.members.length === 0 ? (
            <EmptyState title={tr("عضوی در دامنهٔ شما نیست")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr("عضو")}</TableHead>
                  <TableHead>{tr("ساعت کاری")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {m.name}
                      <span className="block text-xs text-muted-foreground">{m.email}</span>
                    </TableCell>
                    <TableNumericCell>{hoursLabel(m.minutes)}</TableNumericCell>
                    <TableCell className="text-end">
                      <Link
                        href={`/team/${m.id}?range=${data.range}`}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        {tr("جزئیات →")}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {tab === 'projects' && (
        data.projects.length === 0 ? <EmptyState title={tr("پروژه‌ای در دفاترِ شما نیست")} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("پروژه")}</TableHead>
                <TableHead>{tr("وضعیت")}</TableHead>
                <TableHead>{tr("ددلاین")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/projects/${p.id}`} className="hover:underline">{p.title}</Link>
                    {p.isArchived && <Badge variant="secondary" className="ms-2">{tr("بایگانی")}</Badge>}
                  </TableCell>
                  <TableCell>{p.statusName ?? '—'}</TableCell>
                  <TableNumericCell>{p.deadline ?? '—'}</TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      {tab === 'tasks' && (
        <div className="grid gap-3">
          <TaskFilter options={data.taskOptions} paging={data.taskPaging} />
          {data.tasks.length === 0 ? <EmptyState title={tr("تسکی نیست")} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("تسک")}</TableHead>
                <TableHead>{tr("پروژه")}</TableHead>
                <TableHead>{tr("مسئول")}</TableHead>
                <TableHead>{tr("ددلاین")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.title}</TableCell>
                  <TableCell>
                    <Link href={`/projects/${t.projectId}`} className="hover:underline">
                      {t.projectTitle ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell>{t.assigneeName ?? '—'}</TableCell>
                  <TableNumericCell>{t.dueDate ?? '—'}</TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </div>
      )}

      {tab === 'review' && (
        review.length === 0 && data.comments.length === 0 ? (
          <EmptyState title={tr("چیزی منتظرِ بررسی نیست")} />
        ) : (
          <div className="grid gap-4">
            {review.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">{tr("تسک‌های نیازمندِ ریویو")}</h3>
                <ul className="grid gap-1">
                  {review.map((t) => (
                    <li key={t.id} className="rounded-md border px-3 py-2 text-sm">
                      {t.title}
                      <span className="ms-2 text-xs text-muted-foreground">{t.projectTitle}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.comments.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">{tr("کامنت‌های باز")}</h3>
                <ul className="grid gap-1">
                  {data.comments.map((c) => (
                    <li key={c.id} className="rounded-md border px-3 py-2 text-sm">
                      <p className="line-clamp-2">{c.body}</p>
                      <span className="text-xs text-muted-foreground">
                        {c.authorName ?? '—'} · {c.projectTitle}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )
      )}
    </div>
  );
}
