'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { AvailabilityView, type AvailabilityData } from './availability-view';
import { AbsencePanel, type AbsencePanelData } from './absence-panel';
import Link from 'next/link';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useSearchParams } from 'next/navigation';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';

export interface EventRow {
  id: number;
  action: string;
  label: string;
  objectType: string;
  objectId: number | null;
  createdAt: Date | string;
  actorName: string | null;
}

export interface AbsenceRow {
  id: number;
  userName: string | null;
  fromDate: string;
  toDate: string;
  note: string;
}

const TABS = [
  { key: 'events', label: 'رویدادها' },
  { key: 'absences', label: 'مرخصی‌ها' },
  { key: 'availability', label: 'در دسترس بودن' },
] as const;

/** تاریخ/ساعت به وقتِ بیننده — نه UTC ِ خام (`useDateTime`). */
function when(value: Date | string | null | undefined, tz: string): string {
  return formatDateTime(value, tz);
}

export interface Paging {
  page: number;
  totalPages: number;
  total: number;
}

export function ActivityView({
  events,
  paging,
  absences,
  leave,
  availability,
  canSeeFeed,
}: {
  events: EventRow[];
  paging: Paging;
  absences: AbsenceRow[];
  leave: AbsencePanelData;
  availability: AvailabilityData;
  /**
   * خوراکِ رویدادها مجوزِ `activity.view` می‌خواهد. نداشتنش تبِ رویدادها را
   * برمی‌دارد، ولی مرخصی و برنامهٔ هفتگی — که مالِ خودِ کاربرند — می‌مانند.
   */
  canSeeFeed: boolean;
}) {
  const tr = useT();
  const tz = useTimeZone();
  const visible = TABS.filter((t) => t.key !== 'events' || canSeeFeed);

  /**
   * تب از نشانی خوانده می‌شود تا «در دسترس بودن» **لینک‌شدنی** باشد.
   * ⚠️ پیش از این فقط state ِ محلی بود: هیچ راهی نبود کسی را مستقیم به
   * ماتریسِ تیم بفرستی، و رفرش هم به تبِ اول برمی‌گشت.
   */
  const params = useSearchParams();
  const asked = params.get('tab');
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>(
    visible.some((x) => x.key === asked)
      ? (asked as (typeof TABS)[number]['key'])
      : visible[0]!.key,
  );

  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-1 border-b">
        {visible.map((t) => (
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

      {tab === 'events' && (
        events.length === 0 ? <EmptyState title={tr("رویدادی ثبت نشده")} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("رویداد")}</TableHead>
                <TableHead>{tr("مورد")}</TableHead>
                <TableHead>{tr("کاربر")}</TableHead>
                <TableHead>{tr("زمان")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell><Badge variant="secondary">{tr(e.label)}</Badge></TableCell>
                  <TableCell className="num">
                    {e.objectType}
                    {e.objectId ? ` #${e.objectId}` : ''}
                  </TableCell>
                  <TableCell>{e.actorName ?? '—'}</TableCell>
                  <TableNumericCell>{when(e.createdAt, tz)}</TableNumericCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      {/*
        صفحه‌بندی — پیوندِ ساده، نه دکمهٔ کلاینتی: نشانیِ صفحه باید قابلِ
        اشتراک و بازگشت‌پذیر بماند.
        ⚠️ فقط وقتی نشان داده می‌شود که واقعاً بیش از یک صفحه باشد.
      */}
      {tab === 'events' && paging.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-xs text-muted-foreground">
            {tr('صفحهٔ {page} از {total} · {count} رویداد', {
              page: paging.page,
              total: paging.totalPages,
              count: paging.total,
            })}
          </span>
          <div className="flex gap-1">
            {paging.page > 1 && (
              <Link
                href={`/activity?page=${paging.page - 1}`}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                {tr("تازه‌تر")}
              </Link>
            )}
            {paging.page < paging.totalPages && (
              <Link
                href={`/activity?page=${paging.page + 1}`}
                className="rounded-md border px-3 py-1 text-xs hover:bg-muted"
              >
                {tr("قدیمی‌تر")}
              </Link>
            )}
          </div>
        </div>
      )}

      {tab === 'absences' && (
        <div className="grid gap-6">
          <AbsencePanel data={leave} />

          {/* جدولِ تیمی — فقط با مجوزِ اعضا پر می‌شود (سرور تصمیم می‌گیرد). */}
          <div className="grid gap-2">
            <p className="text-sm font-medium">{tr("مرخصی‌های تیم (۳۰ روزِ اخیر)")}</p>
            {absences.length === 0 ? <EmptyState title={tr("مرخصی‌ای در این بازه نیست")} /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("عضو")}</TableHead>
                <TableHead>{tr("از")}</TableHead>
                <TableHead>{tr("تا")}</TableHead>
                <TableHead>{tr("توضیح")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {absences.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.userName ?? '—'}</TableCell>
                  <TableNumericCell>{a.fromDate}</TableNumericCell>
                  <TableNumericCell>{a.toDate}</TableNumericCell>
                  <TableCell>{a.note || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            )}
          </div>
        </div>
      )}

      {tab === 'availability' && <AvailabilityView data={availability} />}
    </div>
  );
}
