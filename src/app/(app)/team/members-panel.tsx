'use client';

import { UserName } from '@/components/user-avatar';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Download, FolderKanban, ListTodo, TreePalm } from 'lucide-react';
import { hoursLabel } from '@/domain/timelogs/timer';
import { RANGE_LABELS, type RangeKey } from '@/domain/access/office-scope';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { Item } from '@/components/ui/item';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { SearchInput } from '@/components/ui/search-input';
import {
  Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { Section } from '@/components/page-shell';
import { Thumb } from '@/components/thumb';
import { useT } from '@/i18n/client';
import { TeamMatrix, type MatrixRowView } from '../projects/[id]/manage-tab';

export interface MembersData {
  members: Array<{
    id: number; name: string; email: string; minutes: number; projects: number;
    roleNames: string[]; onLeave: boolean; openTasks: number; avatarFileId: number | null;
  }>;
  hours: Array<{ id: number; name: string; projects: number; minutes: number; openTasks: number }>;
  matrix: MatrixRowView[];
  dayLabels: string[];
  range: RangeKey;
  from: string;
  to: string;
}

/**
 * تبِ «اعضا و ساعت کاری» — پورتِ بدنهٔ `view_office_report` + `view_team_members`:
 * فیلترِ بازه (سه پیش‌تنظیم + بازهٔ دلخواه)، جدول و نمودارِ ساعتِ تیم در بازه،
 * کارت‌های کارکنان، و در دسترس بودنِ تیم.
 */
export function MembersPanel({ data }: { data: MembersData }) {
  const tr = useT();
  const query = rangeQuery(data);
  return (
    <div className="grid gap-6">
      <RangeFilter data={data} />

      <Section
        title={tr('ساعت کاری تیم در این بازه')}
        actions={(
          <Button asChild size="sm" variant="outline">
            <a href={`/team/export?${query}`}>
              <Download />
              {tr('خروجی CSV')}
            </a>
          </Button>
        )}
      >
        {data.hours.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr('در این بازه ساعتی ثبت نشده.')}</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tr('عضو')}</TableHead>
                  <TableHead numeric>{tr('پروژه‌ها')}</TableHead>
                  <TableHead numeric>{tr('ساعت کاری')}</TableHead>
                  <TableHead numeric>{tr('تسک باز')}</TableHead>
                  <TableActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.hours.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium"><UserName userId={h.id} name={h.name} size="sm" /></TableCell>
                    <TableNumericCell>{h.projects}</TableNumericCell>
                    <TableNumericCell>{hoursLabel(h.minutes)}</TableNumericCell>
                    <TableNumericCell>{h.openTasks}</TableNumericCell>
                    <TableActionsCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/team/${h.id}?${query}`}>
                          {tr('جزئیات')}
                          <ArrowLeft className="ltr:rotate-180" />
                        </Link>
                      </Button>
                    </TableActionsCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <HoursBars rows={data.hours} />
          </>
        )}
      </Section>

      <Section title={tr('کارکنان تحت مدیریت')}>
        {data.members.length === 0
          ? <EmptyState title={tr('عضوی در دامنهٔ شما نیست')} />
          : <MemberCards members={data.members} query={query} />}
      </Section>

      {data.matrix.length > 0 && (
        <Section title={tr('در دسترس بودن تیم')}>
          <TeamMatrix rows={data.matrix} dayLabels={data.dayLabels} />
        </Section>
      )}
    </div>
  );
}

/** پارامترهای بازه برای پیوندها — بازهٔ دلخواه تاریخ‌هایش را هم با خود می‌برد. */
function rangeQuery(data: Pick<MembersData, 'range' | 'from' | 'to'>): string {
  const q = new URLSearchParams({ range: data.range });
  if (data.range === 'custom') {
    q.set('from', data.from);
    q.set('to', data.to);
  }
  return q.toString();
}

/**
 * فیلترِ بازه — پورتِ `office_range_filter`: «این هفته / این ماه / همه» و فرمِ
 * «از … تا …». ⚠️ پیش از این بازهٔ دلخواه فقط با ویرایشِ دستیِ آدرس ممکن بود.
 */
function RangeFilter({ data }: { data: MembersData }) {
  const tr = useT();
  const router = useRouter();
  const presets = (Object.keys(RANGE_LABELS) as RangeKey[]).filter((r) => r !== 'custom');

  const apply = (form: FormData) => {
    const from = String(form.get('from') ?? '');
    const to = String(form.get('to') ?? '');
    if (!from || !to) return;
    router.push(`/team?${new URLSearchParams({ tab: 'members', range: 'custom', from, to }).toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((r) => (
          <Button key={r} asChild size="sm" variant={data.range === r ? 'default' : 'outline'}>
            <Link href={`/team?tab=members&range=${r}`}>{tr(RANGE_LABELS[r])}</Link>
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); apply(new FormData(e.currentTarget)); }}
      >
        <div className="grid gap-1">
          <Label htmlFor="team-from" className="text-xs text-muted-foreground">{tr('از')}</Label>
          <DatePicker id="team-from" name="from" defaultValue={data.range === 'custom' ? data.from : ''} size="sm" className="w-40" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="team-to" className="text-xs text-muted-foreground">{tr('تا')}</Label>
          <DatePicker id="team-to" name="to" defaultValue={data.range === 'custom' ? data.to : ''} size="sm" className="w-40" />
        </div>
        <Button type="submit" size="sm" variant={data.range === 'custom' ? 'default' : 'outline'}>
          {tr('اعمال')}
        </Button>
      </form>
    </div>
  );
}

/** نمودارِ میله‌ایِ ساعت — پورتِ `hours_bars`: بلندترین میله = پرکارترین نفر. */
function HoursBars({ rows }: { rows: MembersData['hours'] }) {
  const tr = useT();
  const max = Math.max(0, ...rows.map((r) => r.minutes));
  if (max <= 0) return null;
  return (
    <ul className="grid gap-2" aria-label={tr('نمودارِ ساعت کاری')}>
      {rows.map((r) => (
        <li key={r.id} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm">
          <UserName userId={r.id} name={r.name} />
          <Progress value={Math.round((r.minutes * 100) / max)} aria-label={r.name} />
          <span className="num text-xs text-muted-foreground">{hoursLabel(r.minutes)}</span>
        </li>
      ))}
    </ul>
  );
}

/** پورتِ کارت‌های «کارکنان تحت مدیریت»: آواتار، نام + نشانِ مرخصی، نقش‌ها، ساعت · پروژه · تسکِ باز، جستجوی زنده. */
function MemberCards({ members, query }: { members: MembersData['members']; query: string }) {
  const tr = useT();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = needle === '' ? members : members.filter((m) => m.name.toLowerCase().includes(needle));
  return (
    <div className="grid gap-3">
      <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('جستجوی کارمند…')} />
      {list.length === 0 ? <p className="text-sm text-muted-foreground">{tr('موردی پیدا نشد.')}</p> : (
        <div className="grid gap-2 @xl/main:grid-cols-2 @4xl/main:grid-cols-3">
          {list.map((m) => (
            <Item key={m.id} asChild variant="outline" size="sm" className="gap-3 p-3">
              <Link href={`/team/${m.id}?${query}`}>
                <Thumb id={m.id} title={m.name} fileId={m.avatarFileId} person size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{m.name}</span>
                    {m.onLeave && (
                      <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-500">
                        <TreePalm aria-hidden />
                        {tr('مرخصی')}
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.roleNames.length > 0 ? m.roleNames.join('، ') : tr('عضو')}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                    <Clock className="size-3" aria-hidden />
                    <span className="num">{hoursLabel(m.minutes)}</span>
                    <span aria-hidden>·</span>
                    <FolderKanban className="size-3" aria-hidden />
                    {tr('{n} پروژه', { n: m.projects })}
                    <span aria-hidden>·</span>
                    <ListTodo className="size-3" aria-hidden />
                    {tr('{n} تسک باز', { n: m.openTasks })}
                  </span>
                </span>
              </Link>
            </Item>
          ))}
        </div>
      )}
    </div>
  );
}
