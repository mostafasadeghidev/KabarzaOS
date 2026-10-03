'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { activityEventAction } from './_form/activity-actions';
import type { ActivityEventDetail, EventSubject } from '@/server/activity/service';
import { fieldRef, refKey, type ChangeRow, type RefKind } from '@/domain/activity/details';
import { FIELD_LABELS, VALUE_LABELS } from '@/domain/activity/fields';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';

type Tr = ReturnType<typeof useT>;

/** «پروژه: طراحی سایت» — همان شکل در فهرست و سرِ دیالوگ. */
export function SubjectText({ subject }: { subject: EventSubject }) {
  const tr = useT();
  if (subject.name === null && subject.id === null) return <>{tr(subject.kindLabel)}</>;
  return (
    <span className="grid gap-0.5">
      <span>
        <span className="text-muted-foreground">{tr(subject.kindLabel)}: </span>
        {subject.name ?? `#${subject.id}`}
      </span>
      {subject.projectTitle && subject.kind !== 'project' && subject.kind !== 'bid'
        && subject.kind !== 'unit' && subject.kind !== 'payment_request' && (
        <span className="text-xs text-muted-foreground">
          {tr('در پروژهٔ «{name}»', { name: subject.projectTitle })}
        </span>
      )}
    </span>
  );
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * یک مقدار به زبانِ آدم: شناسه به نام، بله/خیر، برچسبِ وضعیت، زمان به وقتِ
 * بیننده. شیءِ تو در تو به شکلِ «فیلد: مقدار» باز می‌شود.
 */
function Value({
  value, field, action, refKind, refs, tr, tz, depth = 0,
}: {
  value: unknown;
  field: string;
  action: string;
  refKind: RefKind | null;
  refs: Record<string, string>;
  tr: Tr;
  tz: string;
  depth?: number;
}) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === 'boolean') return <>{value ? tr('بله') : tr('خیر')}</>;

  if (refKind) {
    const ids = (Array.isArray(value) ? value : [value]).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length > 0) {
      // شناسه‌ای که دیگر نیست (تگ یا فردِ حذف‌شده) — «حذف‌شده #۱۰»، نه «#۱۰» ِ گنگ.
      return <>{ids.map((id) => refs[refKey(refKind, id)] ?? `${tr('حذف‌شده')} #${id}`).join('، ')}</>;
    }
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const label = VALUE_LABELS[field]?.[String(value)];
    if (label) return <>{tr(label)}</>;
    if (typeof value === 'string' && ISO_TIME.test(value)) return <span className="num">{formatDateTime(value, tz)}</span>;
    return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== 'object' || v === null)) {
      return <>{value.map((v) => VALUE_LABELS[field]?.[String(v)] ? tr(VALUE_LABELS[field]![String(v)]!) : String(v)).join('، ')}</>;
    }
    return (
      <span className="grid gap-1.5">
        {value.map((item, i) => (
          <span key={i} className="block rounded-md bg-muted/50 px-2 py-1">
            <Value value={item} field={field} action={action} refKind={null} refs={refs} tr={tr} tz={tz} depth={depth + 1} />
          </span>
        ))}
      </span>
    );
  }

  if (typeof value === 'object' && depth < 3) {
    return (
      <span className="grid gap-0.5">
        {Object.entries(value as Record<string, unknown>).map(([key, v]) => (
          <span key={key} className="block">
            <span className="text-muted-foreground">{tr(FIELD_LABELS[key] ?? key)}: </span>
            <Value value={v} field={key} action={action} refKind={fieldRef(action, key)} refs={refs} tr={tr} tz={tz} depth={depth + 1} />
          </span>
        ))}
      </span>
    );
  }
  return <span className="break-all">{JSON.stringify(value)}</span>;
}

function ChangeList({ detail, tr, tz }: { detail: ActivityEventDetail; tr: Tr; tz: string }) {
  const { mode, rows, unchanged } = detail.changes;
  const show = (row: ChangeRow, side: 'before' | 'after') => (
    <Value
      value={row[side]} field={row.field} action={detail.action} refKind={row.ref}
      refs={detail.refs} tr={tr} tz={tz}
    />
  );

  if (mode === 'none' || rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {unchanged > 0
          ? tr('ذخیره شد، ولی هیچ فیلدی تغییر نکرد.')
          : tr('جزئیاتِ بیشتری برای این رویداد ثبت نشده است.')}
      </p>
    );
  }

  const heading = mode === 'diff'
    ? tr('تغییرات')
    : mode === 'removed' ? tr('حالتِ پیش از این رویداد') : tr('مقدارهای ثبت‌شده');

  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{heading}</h3>
      <dl className="divide-y rounded-md border text-sm">
        {rows.map((row) => (
          <div key={row.field} className="grid gap-1 p-3 sm:grid-cols-[11rem_1fr] sm:gap-3">
            <dt className="text-muted-foreground">{tr(FIELD_LABELS[row.field] ?? row.field)}</dt>
            <dd className="min-w-0">
              {mode === 'diff' ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 rounded bg-red-50 px-1.5 py-0.5 text-red-800 dark:bg-red-500/15 dark:text-red-300">
                    {'before' in row ? show(row, 'before') : <em className="not-italic opacity-70">{tr('ثبت نشده')}</em>}
                  </span>
                  <ArrowRight aria-label={tr('به')} className="size-3.5 shrink-0 text-muted-foreground rtl:-scale-x-100" />
                  <span className="min-w-0 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {'after' in row ? show(row, 'after') : <span className="text-muted-foreground">—</span>}
                  </span>
                </span>
              ) : show(row, mode === 'removed' ? 'before' : 'after')}
            </dd>
          </div>
        ))}
      </dl>
      {mode === 'diff' && unchanged > 0 && (
        <p className="text-xs text-muted-foreground">
          {tr('{n} فیلدِ دیگر هم ذخیره شد ولی تغییری نکرد.', { n: unchanged })}
        </p>
      )}
      {mode === 'diff' && rows.some((r) => !('before' in r)) && (
        <p className="text-xs text-muted-foreground">
          {tr('«ثبت نشده» یعنی مقدارِ قبلیِ این فیلد در رویداد نگه داشته نشده است، نه اینکه خالی بوده.')}
        </p>
      )}
    </div>
  );
}

/**
 * دیالوگِ جزئیاتِ یک رویداد — چه کسی، کی، روی چه چیزی، و دقیقاً چه چیزی
 * عوض شد. داده با باز شدن گرفته می‌شود تا فهرست سبک بماند.
 */
export function EventDialog({ eventId, onClose }: { eventId: number | null; onClose: () => void }) {
  const tr = useT();
  const tz = useTimeZone();
  const { show } = useToast();
  const [detail, setDetail] = useState<ActivityEventDetail | null>(null);

  useEffect(() => {
    if (eventId === null) return;
    let alive = true;
    setDetail(null);
    activityEventAction(eventId)
      .then((d) => {
        if (!alive) return;
        if (!d) {
          show(tr('این رویداد پیدا نشد.'), 'error');
          onClose();
          return;
        }
        setDetail(d);
      })
      .catch(() => {
        if (!alive) return;
        show(tr('جزئیاتِ رویداد بارگذاری نشد.'), 'error');
        onClose();
      });
    return () => { alive = false; };
  }, [eventId]);

  const projectHref = detail?.subject.projectId ? `/projects/${detail.subject.projectId}` : null;

  return (
    <Dialog open={eventId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {detail ? <Badge variant="secondary">{tr(detail.label)}</Badge> : tr('جزئیاتِ رویداد')}
          </DialogTitle>
          <DialogDescription>
            {detail && (
              <>
                {detail.actorName ?? (detail.actorType === 'system' ? tr('سامانه') : '—')}
                {' · '}
                <span className="num">{formatDateTime(detail.createdAt, tz)}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!detail ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-muted/50 p-3 text-sm">
              <SubjectText subject={detail.subject} />
              {projectHref && (
                <Link href={projectHref} className="text-primary underline-offset-4 hover:underline">
                  {tr('باز کردنِ پروژه')}
                </Link>
              )}
            </div>
            <ChangeList detail={detail} tr={tr} tz={tz} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
