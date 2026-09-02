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
import { Thumb } from '@/components/thumb';
import { Input } from '@/components/ui/input';

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
  members: Array<{
    id: number; name: string; email: string; minutes: number;
    roleNames: string[]; onLeave: boolean; openTasks: number; avatarFileId: number | null;
  }>;
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
/** پورتِ کارت‌های «کارکنان تحت مدیریت»: آواتار، نام + 🌴، نقش‌ها، ⏱ ساعت · 📋 تسکِ باز، جستجوی زنده. */
function MemberCards({ members, range }: { members: TeamData['members']; range: RangeKey }) {
  const tr = useT();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = needle === '' ? members : members.filter((m) => m.name.toLowerCase().includes(needle));
  return (
    <div className="grid gap-3">
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tr("جستجوی کارمند…")}
        className="max-w-xs"
      />
      {list.length === 0 ? <p className="text-sm text-muted-foreground">{tr("موردی پیدا نشد.")}</p> : (
        <div className="grid gap-2 @xl/main:grid-cols-2 @4xl/main:grid-cols-3">
          {list.map((m) => (
            <Link
              key={m.id}
              href={`/team/${m.id}?range=${range}`}
              className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted"
            >
              <Thumb id={m.id} title={m.name} fileId={m.avatarFileId} size={44} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="truncate">{m.name}</span>
                  {m.onLeave && <Badge variant="outline" className="text-[10px]">🌴 {tr("مرخصی")}</Badge>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {m.roleNames.length > 0 ? m.roleNames.join('، ') : tr("عضو")}
                </span>
                <span className="num block text-xs text-muted-foreground">
                  ⏱ {hoursLabel(m.minutes)} · 📋 {tr('{n} تسک باز', { n: m.openTasks })}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
            <MemberCards members={data.members} range={data.range} />
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
