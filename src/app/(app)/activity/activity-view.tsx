'use client';

import { UserName } from '@/components/user-avatar';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { Pager } from '@/components/ui/pager';
import { ChevronLeft } from 'lucide-react';
import type { EventSubject } from '@/server/activity/service';
import { EventDialog, SubjectText } from './event-dialog';
import { EventsFilter } from './events-filter';
import { useSearchParams } from 'next/navigation';

export interface EventRow {
  id: number;
  action: string;
  label: string;
  objectType: string;
  objectId: number | null;
  createdAt: Date | string;
  actorId?: number | null;
  actorName: string | null;
  actorType: string;
  /** «مورد» به زبانِ آدم — نه `user #2`. */
  subject: EventSubject;
}

export interface AbsenceRow {
  id: number;
  userId?: number | null;
  userName: string | null;
  fromDate: string;
  toDate: string;
  note: string;
}

/** تاریخ/ساعت به وقتِ بیننده — نه UTC ِ خام (`useDateTime`). */
function when(value: Date | string | null | undefined, tz: string): string {
  return formatDateTime(value, tz);
}

export interface Paging {
  page: number;
  perPage: number;
  totalPages: number;
  total: number;
}

/**
 * «رویدادها» — گزارشِ رویدادهای سامانه (۲.۲.۰).
 *
 * ⚠️ پیش از این سه تب داشت (رویدادها، مرخصی‌ها، در دسترس بودن) و سه مخاطبِ
 * جدا را در یک صفحه قاطی می‌کرد. برنامه و مرخصیِ خودِ کاربر به «برنامهٔ من»
 * رفت و مرخصی‌های تیم به «حضور و مرخصیِ تیم»؛ اینجا فقط رویداد می‌ماند.
 */
export function ActivityView({
  events,
  paging,
}: {
  events: EventRow[];
  paging: Paging;
}) {
  const tr = useT();
  const tz = useTimeZone();
  const params = useSearchParams();
  /** پیوندِ صفحه‌ها فیلترِ فعلی را نگه می‌دارد. */
  const pageHref = (n: number) => {
    const next = new URLSearchParams(params.toString());
    next.set('page', String(n));
    return `/activity?${next.toString()}`;
  };
  const filtered = ['q', 'from', 'to'].some((k) => (params.get(k) ?? '') !== '');
  /** رویدادی که دیالوگِ جزئیاتش باز است. */
  const [openEvent, setOpenEvent] = useState<number | null>(null);

  return (
    <div className="grid gap-4">
      <EventsFilter />
      {events.length === 0 ? (
        <EmptyState title={filtered ? tr("رویدادی با این فیلتر پیدا نشد") : tr("رویدادی ثبت نشده")} />
      ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("رویداد")}</TableHead>
                <TableHead>{tr("مورد")}</TableHead>
                <TableHead>{tr("کاربر")}</TableHead>
                <TableHead numeric>{tr("زمان")}</TableHead>
                <TableHead className="w-8"><span className="sr-only">{tr("جزئیات")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/*
                ⚠️ کلِ ردیف کلیک‌خور است و با Enter/فاصله هم باز می‌شود؛ ستونِ
                آخر فقط نشانهٔ دیدنی است که «جزئیات دارد».
              */}
              {events.map((e) => (
                <TableRow
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  aria-label={tr('جزئیاتِ رویداد')}
                  className="cursor-pointer"
                  onClick={() => setOpenEvent(e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      setOpenEvent(e.id);
                    }
                  }}
                >
                  <TableCell><Badge variant="secondary">{tr(e.label)}</Badge></TableCell>
                  <TableCell className="whitespace-normal"><SubjectText subject={e.subject} /></TableCell>
                  <TableCell>
                    {e.actorName
                      ? <UserName userId={e.actorId} name={e.actorName} size="sm" />
                      : (e.actorType === 'system' ? tr('سامانه') : '—')}
                  </TableCell>
                  <TableNumericCell>{when(e.createdAt, tz)}</TableNumericCell>
                  <TableCell className="w-8 text-muted-foreground">
                    <ChevronLeft aria-hidden className="size-4 ltr:-scale-x-100" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      )}

      {/*
        صفحه‌بندی — پیوند، نه دکمهٔ کلاینتی: نشانیِ صفحه باید قابلِ اشتراک و
        بازگشت‌پذیر بماند. همان صفحه‌بندِ مشترکِ اپ؛ خودش با یک صفحه پنهان می‌شود.
      */}
      <Pager
        page={paging.page}
        totalPages={paging.totalPages}
        total={paging.total}
        perPage={paging.perPage}
        hrefOf={pageHref}
      />

      <EventDialog eventId={openEvent} onClose={() => setOpenEvent(null)} onNavigate={setOpenEvent} />
    </div>
  );
}
