'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Clock, Lock, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import {
  confirmPendingAction, deleteLogAction, discardPendingAction, logHoursAction,
  resumePendingAction, startTimerAction, stopTimerAction, updateLogAction,
  type HoursState,
} from './_form/actions';
import { hoursLabel } from '@/domain/timelogs/timer';
import { HOURS_PER_PAGE, hoursQuery } from '@/domain/timelogs/hours-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableActionsCell, TableActionsHead, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow } from '@/components/ui/table';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { ltr } from '@/i18n/bidi';
import { useConfirm } from '@/components/ui/confirm';
import { NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { StatCard } from '@/components/stat-card';
import { Panel } from '@/components/page-shell';
import { IconButton } from '@/components/ui/icon-button';
import { Pager } from '@/components/ui/pager';

export interface LogRow {
  id: number;
  projectId: number | null;
  projectTitle: string | null;
  logDate: string;
  minutes: number;
  description: string;
  editable: boolean;
}

export interface HoursData {
  running: { projectTitle: string | null; minutes: number } | null;
  pending: { projectTitle: string | null; minutes: number; logDate: string } | null;
  projects: Array<{ id: number; title: string }>;
  logs: LogRow[];
  /** صفحه‌بندیِ ۱۵تایی با حفظِ فیلتر (پورتِ افزونه). */
  pager: { page: number; pages: number; total: number };
  /** جمعِ بازه — فقط وقتی فیلتری فعال است. */
  rangeMinutes: number | null;
  filter: { from: string; to: string; project: string };
  /** عنوانِ پروژه‌هایی که رویشان ساعت زده — پیشنهادِ فیلترِ نام. */
  projectTitles: string[];
  totals: { week: number; month: number };
  /** «بدون پروژه (کارِ عمومی)» فقط برای کسی که مجازش است (پورتِ `can_log_general`). */
  canLogGeneral: boolean;
  today: string;
}


function Submit({ children, variant }: { children: React.ReactNode; variant?: 'outline' | 'default' }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? <><Spinner />{tr('صبر کنید…')}</> : children}
    </Button>
  );
}

/** انتخابگرِ پروژه — مقدارِ خالی یعنی «کارِ عمومی» (فقط وقتی مجاز است). */
function ProjectSelect({
  projects,
  id,
  allowGeneral,
  defaultValue = '',
}: {
  projects: HoursData['projects'];
  id: string;
  allowGeneral: boolean;
  defaultValue?: string;
}) {
  const t = useT();
  return (
    <SearchableSelect id={id} name="projectId" containerClassName="w-full" defaultValue={defaultValue} required={!allowGeneral}>
      {/* ⚠️ ساعتِ عمومی یک گزینهٔ واقعی است، نه «انتخاب نشده» — ولی فقط برای کسی که مجازش است. */}
      {allowGeneral && <NativeSelectOption value="">{t("بدون پروژه (کارِ عمومی)")}</NativeSelectOption>}
      {projects.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.title}</NativeSelectOption>)}
    </SearchableSelect>
  );
}

/**
 * تایمرِ زنده — عددِ روی صفحه هر دقیقه جلو می‌رود.
 * ⚠️ فقط نمایش است؛ مدتِ واقعی را سرور از لحظهٔ شروع حساب می‌کند، پس بستنِ
 * تب چیزی را از بین نمی‌برد.
 */
function LiveMinutes({ from }: { from: number }) {
  const [minutes, setMinutes] = useState(from);

  useEffect(() => {
    setMinutes(from);
    const tick = setInterval(() => setMinutes((m) => m + 1), 60_000);
    return () => clearInterval(tick);
  }, [from]);

  return <span className="num text-2xl font-semibold">{hoursLabel(minutes)}</span>;
}

/**
 * ساعتِ کاری — تایمر، ثبتِ دستی و فهرستِ ثبت‌ها.
 * پورتِ `time_logging_section()` + `timer_banner()` + `view_hours()`.
 */
export function HoursView({ data }: { data: HoursData }) {
  const tr = useT();
  const ask = useConfirm();
  const t = useT();
  const [startState, start] = useActionState(startTimerAction, {});
  useActionToast(startState);
  const [stopState, stop] = useActionState(stopTimerAction, {});
  useActionToast(stopState);
  const [confirmState, confirm] = useActionState(confirmPendingAction, {});
  useActionToast(confirmState);
  const [logState, log] = useActionState(logHoursAction, {});
  useActionToast(logState);
  const [editing, setEditing] = useState<LogRow | null>(null);
  const [editState, edit] = useActionState<HoursState, FormData>(async (prev, form) => {
    const result = await updateLogAction(prev, form);
    if (result.message) setEditing(null);
    return result;
  }, {});
  useActionToast(editState);

  const canLogSomething = data.canLogGeneral || data.projects.length > 0;
  const pageHref = (page: number) => `/hours?${hoursQuery(data.filter, page)}`;
  const filtered = data.rangeMinutes !== null;

  return (
    <div className="grid gap-4">
      {/* پورتِ آمارِ افزونه: هفتهٔ تقویمی از روزِ شروعِ تنظیمات + این ماه. */}
      <div className="grid gap-4 @2xl/main:grid-cols-2">
        <StatCard label={t("این هفته")} value={hoursLabel(data.totals.week)} />
        <StatCard label={t("این ماه")} value={hoursLabel(data.totals.month)} />
      </div>

      {/* ── تایمرِ پارک‌شده: مهم‌ترین حالت، پس بالاتر از همه ── */}
      {data.pending && (
        <Panel tone="warning" title={t("تایمرِ طولانی — تأیید کنید")}>
          <p className="text-sm text-muted-foreground">
            {t('{hours} روی «{project}» شمرده شد ({date}).', {
              hours: hoursLabel(data.pending.minutes),
              project: data.pending.projectTitle ?? t('کارِ عمومی'),
              date: ltr(data.pending.logDate),
            })}
            {' '}{t('چون بیش از ۵ ساعت است خودکار ثبت نشده — شاید یادتان رفته متوقفش کنید.')}
          </p>

          <form action={confirm} className="flex flex-wrap items-end gap-2">
            <Field>
              <FieldLabel htmlFor="pc-h">{t("ساعت")}</FieldLabel>
              <Input
                id="pc-h" name="hours" type="number" min={0}
                className="num w-20"
                defaultValue={Math.floor(data.pending.minutes / 60)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="pc-m">{t("دقیقه")}</FieldLabel>
              <Input
                id="pc-m" name="minutes" type="number" min={0} max={59}
                className="num w-20"
                defaultValue={data.pending.minutes % 60}
              />
            </Field>
            <Submit>{t("ثبتِ این مدت")}</Submit>
            <Button type="button" size="sm" variant="outline" onClick={() => resumePendingAction()}>
              <Play className="size-3.5" />
              {tr("ادامهٔ تایمر")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => discardPendingAction()}>
              {tr("دور بینداز")}
            </Button>
          </form>
        </Panel>
      )}

      {/* ── تایمرِ در حالِ اجرا / شروعِ تایمر ── */}
      {!data.pending && canLogSomething && (
        <Panel icon={<Clock />} title={tr("تایمر")}>
          {data.running ? (
            <form action={stop} className="grid gap-3">
              <div className="flex items-center gap-3">
                <LiveMinutes from={data.running.minutes} />
                <Badge variant="secondary">{data.running.projectTitle ?? t('کارِ عمومی')}</Badge>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field className="flex-1">
                  <FieldLabel htmlFor="stop-desc">{t("توضیح (اختیاری)")}</FieldLabel>
                  <Input id="stop-desc" name="description" placeholder={t("روی چه کار کردید؟")} />
                </Field>
                <Submit variant="outline">
                  <Pause className="size-3.5" />
                  {tr("توقف و ثبت")}
                </Submit>
              </div>
            </form>
          ) : (
            <form action={start} className="flex flex-wrap items-end gap-2">
              <Field className="flex-1">
                <FieldLabel htmlFor="start-project">{t("پروژه")}</FieldLabel>
                <ProjectSelect projects={data.projects} id="start-project" allowGeneral={data.canLogGeneral} />
              </Field>
              <Submit>
                <Play className="size-3.5" />
                {tr("شروع")}
              </Submit>
            </form>
          )}
        </Panel>
      )}

      {/* ── ثبتِ دستی ── */}
      {canLogSomething ? (
        <Panel title={t("ثبتِ دستی")}>
          <form action={log} className="grid gap-3">
            <div className="grid gap-2 @xl/main:grid-cols-4">
              <Field className="@xl/main:col-span-2">
                <FieldLabel htmlFor="log-project">{t("پروژه")}</FieldLabel>
                <ProjectSelect projects={data.projects} id="log-project" allowGeneral={data.canLogGeneral} />
              </Field>
              <Field>
                <FieldLabel htmlFor="log-date">{t("تاریخ")}</FieldLabel>
                <DatePicker id="log-date" name="logDate" defaultValue={data.today} required />
              </Field>
              <div className="flex items-end gap-2">
                <Field>
                  <FieldLabel htmlFor="log-h">{t("ساعت")}</FieldLabel>
                  <Input id="log-h" name="hours" type="number" min={0} className="num w-16" defaultValue={0} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="log-m">{t("دقیقه")}</FieldLabel>
                  <Input id="log-m" name="minutes" type="number" min={0} max={59} className="num w-16" defaultValue={0} />
                </Field>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field className="flex-1">
                <FieldLabel htmlFor="log-desc">{t("توضیح")}</FieldLabel>
                <Input id="log-desc" name="description" />
              </Field>
              <Submit>{t("ثبت")}</Submit>
            </div>
            <p className="text-xs text-muted-foreground">
              {tr("ثبتِ همان روز و همان پروژه با ثبتِ قبلی ادغام می‌شود، نه ردیفِ تازه.")}
            </p>
          </form>
        </Panel>
      ) : (
        // پورتِ افزونه: بدونِ پروژهٔ باز و بدونِ مجوزِ ساعتِ عمومی، فرمی نیست.
        <p className="text-sm text-muted-foreground">{t("پروژهٔ بازی برای ثبتِ ساعت ندارید.")}</p>
      )}

      {/* ── فیلترها (پورتِ view_hours): بازه و نامِ پروژه؛ فرمِ GET تا لینک قابلِ اشتراک بماند ── */}
      {/* ⚠️ همان نوارِ فیلترِ دفترکل و گزارش‌ها: قابِ ساده، برچسبِ ریز، کنترل‌های `sm`. */}
      <div className="grid gap-2">
        <form method="get" action="/hours" className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
          <Field>
            <FieldLabel htmlFor="f-from" className="text-xs">{t("از تاریخ")}</FieldLabel>
            <DatePicker id="f-from" name="from" size="sm" className="w-[9.5rem]" defaultValue={data.filter.from} />
          </Field>
            <Field>
              <FieldLabel htmlFor="f-to" className="text-xs">{t("تا تاریخ")}</FieldLabel>
              <DatePicker id="f-to" name="to" size="sm" className="w-[9.5rem]" defaultValue={data.filter.to} />
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor="f-project" className="text-xs">{t("پروژه")}</FieldLabel>
              <Input
                id="f-project" name="project" list="hours-project-list" autoComplete="off"
                placeholder={t("نام پروژه…")} defaultValue={data.filter.project} className="h-8"
              />
              <datalist id="hours-project-list">
                {data.projectTitles.map((title) => <NativeSelectOption key={title} value={title} />)}
              </datalist>
            </Field>
            <Button type="submit" size="sm">{t("فیلتر")}</Button>
            {filtered && (
              <Link href="/hours" className="text-xs text-muted-foreground underline">{t("پاک‌کردن")}</Link>
            )}
          </form>
          {/* پورتِ افزونه: جمع فقط وقتی فیلتری فعال است. */}
          {filtered && (
            <p className="text-sm">
              {t("مجموع در این بازه")}: <b className="num">{hoursLabel(data.rangeMinutes ?? 0)}</b>
            </p>
          )}
      </div>

      {/* ── فهرستِ ثبت‌ها ── */}
      {data.logs.length === 0 ? (
        <EmptyState
          title={filtered ? t("رکوردی در این بازه نیست.") : t("ساعتی ثبت نشده")}
          description={filtered ? undefined : t("با تایمر یا ثبتِ دستی شروع کنید.")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead numeric>{t("تاریخ")}</TableHead>
              <TableHead>{t("پروژه")}</TableHead>
              <TableHead>{t("توضیح")}</TableHead>
              <TableHead numeric>{t("مدت")}</TableHead>
              <TableActionsHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.logs.map((l) => (
              <TableRow key={l.id}>
                <TableNumericCell>{l.logDate}</TableNumericCell>
                <TableCell>{l.projectTitle ?? <span className="text-muted-foreground">{t("عمومی")}</span>}</TableCell>
                <TableCell className="max-w-64 truncate">{l.description || '—'}</TableCell>
                <TableNumericCell>{hoursLabel(l.minutes)}</TableNumericCell>
                <TableActionsCell>
                  {/* ⚠️ بعد از دو هفته ثبت قفل می‌شود — دکمه هم پنهان. */}
                  {l.editable ? (
                    <>
                      <IconButton variant="ghost" className="size-8" label={t("ویرایش")} onClick={() => setEditing(l)}>
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        label={t("حذف")}
                        onClick={async () => {
                          if (await ask({ title: t('این ساعت حذف شود؟') })) await deleteLogAction(l.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="size-3" aria-hidden />
                      {t("قفل‌شده")}
                    </span>
                  )}
                </TableActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* پورتِ pager ِ افزونه: ۱۵تایی با حفظِ فیلترها — صفحه در آدرس است، پس پیوند. */}
      <Pager
        page={data.pager.page}
        totalPages={data.pager.pages}
        total={data.pager.total}
        perPage={HOURS_PER_PAGE}
        hrefOf={pageHref}
        label={t('{n} ثبت', { n: data.pager.total })}
      />

      {editing && (
        <Panel title={tr('ویرایشِ ثبتِ {date}', { date: ltr(editing.logDate) })}>
          {/* پورتِ ویرایشِ درون‌خطیِ افزونه: تاریخ، پروژه، ساعت، دقیقه، توضیح. */}
          <form action={edit} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="logId" value={editing.id} />
            <Field>
              <FieldLabel htmlFor="e-date">{t("تاریخ")}</FieldLabel>
              <DatePicker id="e-date" name="logDate" className="w-[9.5rem]" defaultValue={editing.logDate} />
            </Field>
            <Field>
              <FieldLabel htmlFor="e-project">{t("پروژه")}</FieldLabel>
              <ProjectSelect
                projects={data.projects}
                id="e-project"
                allowGeneral={data.canLogGeneral}
                defaultValue={editing.projectId === null ? '' : String(editing.projectId)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="e-h">{t("ساعت")}</FieldLabel>
              <Input id="e-h" name="hours" type="number" min={0} className="num w-16"
                defaultValue={Math.floor(editing.minutes / 60)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="e-m">{t("دقیقه")}</FieldLabel>
              <Input id="e-m" name="minutes" type="number" min={0} max={59} className="num w-16"
                defaultValue={editing.minutes % 60} />
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor="e-desc">{t("توضیح")}</FieldLabel>
              <Input id="e-desc" name="description" defaultValue={editing.description} />
            </Field>
            <Submit>{t("ذخیره")}</Submit>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("بستن")}</Button>
          </form>
        </Panel>
      )}
    </div>
  );
}
