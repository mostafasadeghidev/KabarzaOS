'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Clock, Pause, Play, Trash2 } from 'lucide-react';
import {
  confirmPendingAction, deleteLogAction, discardPendingAction, logHoursAction,
  resumePendingAction, startTimerAction, stopTimerAction, updateLogAction,
  type HoursState,
} from './_form/actions';
import { hoursLabel } from '@/domain/timelogs/timer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow,
} from '@/components/ui/table';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { useConfirm } from '@/components/ui/confirm';

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
  totals: { week: number; total: number };
  today: string;
}

const field =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs';

function Submit({ children, variant }: { children: React.ReactNode; variant?: 'outline' | 'default' }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? tr('صبر کنید…') : children}
    </Button>
  );
}

/** انتخابگرِ پروژه — مقدارِ خالی یعنی «کارِ عمومی». */
function ProjectSelect({
  projects,
  id,
}: {
  projects: HoursData['projects'];
  id: string;
}) {
  const t = useT();
  return (
    <select id={id} name="projectId" className={field} defaultValue="">
      {/* ⚠️ ساعتِ عمومی یک گزینهٔ واقعی است، نه «انتخاب نشده». */}
      <option value="">{t("کارِ عمومی (بدونِ پروژه)")}</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
    </select>
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
  const [editState, edit] = useActionState(updateLogAction, {});
  useActionToast(editState);
  const [editing, setEditing] = useState<LogRow | null>(null);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 @2xl/main:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">{t("این هفته")}</CardTitle>
          </CardHeader>
          <CardContent><p className="num text-xl font-semibold">{hoursLabel(data.totals.week)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">{t("مجموع")}</CardTitle>
          </CardHeader>
          <CardContent><p className="num text-xl font-semibold">{hoursLabel(data.totals.total)}</p></CardContent>
        </Card>
      </div>

      {/* ── تایمرِ پارک‌شده: مهم‌ترین حالت، پس بالاتر از همه ── */}
      {data.pending && (
        <Card className="border-amber-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("تایمرِ طولانی — تأیید کنید")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {t('{hours} روی «{project}» شمرده شد ({date}).', {
                hours: hoursLabel(data.pending.minutes),
                project: data.pending.projectTitle ?? t('کارِ عمومی'),
                date: data.pending.logDate,
              })}
              {' '}{t('چون بیش از ۵ ساعت است خودکار ثبت نشده — شاید یادتان رفته متوقفش کنید.')}
            </p>

            <form action={confirm} className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="pc-h">{t("ساعت")}</Label>
                <Input
                  id="pc-h" name="hours" type="number" min={0}
                  className="num w-20"
                  defaultValue={Math.floor(data.pending.minutes / 60)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pc-m">{t("دقیقه")}</Label>
                <Input
                  id="pc-m" name="minutes" type="number" min={0} max={59}
                  className="num w-20"
                  defaultValue={data.pending.minutes % 60}
                />
              </div>
              <Submit>{t("ثبتِ این مدت")}</Submit>
              <Button type="button" size="sm" variant="outline" onClick={() => resumePendingAction()}>
                <Play className="size-3.5" />
                {tr("ادامهٔ تایمر")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => discardPendingAction()}>
                {tr("دور بینداز")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── تایمرِ در حالِ اجرا / شروعِ تایمر ── */}
      {!data.pending && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Clock className="size-4" />
              {tr("تایمر")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.running ? (
              <form action={stop} className="grid gap-3">
                <div className="flex items-center gap-3">
                  <LiveMinutes from={data.running.minutes} />
                  <Badge variant="secondary">{data.running.projectTitle ?? t('کارِ عمومی')}</Badge>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid flex-1 gap-1.5">
                    <Label htmlFor="stop-desc">{t("توضیح (اختیاری)")}</Label>
                    <Input id="stop-desc" name="description" placeholder={t("روی چه کار کردید؟")} />
                  </div>
                  <Submit variant="outline">
                    <Pause className="size-3.5" />
                    {tr("توقف و ثبت")}
                  </Submit>
                </div>
              </form>
            ) : (
              <form action={start} className="flex flex-wrap items-end gap-2">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="start-project">{t("پروژه")}</Label>
                  <ProjectSelect projects={data.projects} id="start-project" />
                </div>
                <Submit>
                  <Play className="size-3.5" />
                  {tr("شروع")}
                </Submit>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── ثبتِ دستی ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("ثبتِ دستی")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={log} className="grid gap-3">
            <div className="grid gap-2 @xl/main:grid-cols-4">
              <div className="grid gap-1.5 @xl/main:col-span-2">
                <Label htmlFor="log-project">{t("پروژه")}</Label>
                <ProjectSelect projects={data.projects} id="log-project" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="log-date">{t("تاریخ")}</Label>
                <Input id="log-date" name="logDate" type="date" defaultValue={data.today} required />
              </div>
              <div className="flex items-end gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="log-h">{t("ساعت")}</Label>
                  <Input id="log-h" name="hours" type="number" min={0} className="num w-16" defaultValue={0} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="log-m">{t("دقیقه")}</Label>
                  <Input id="log-m" name="minutes" type="number" min={0} max={59} className="num w-16" defaultValue={0} />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="log-desc">{t("توضیح")}</Label>
                <Input id="log-desc" name="description" />
              </div>
              <Submit>{t("ثبت")}</Submit>
            </div>
            <p className="text-xs text-muted-foreground">
              {tr("ثبتِ همان روز و همان پروژه با ثبتِ قبلی ادغام می‌شود، نه ردیفِ تازه.")}
            </p>
          </form>
        </CardContent>
      </Card>

      {/* ── فهرستِ ثبت‌ها ── */}
      {data.logs.length === 0 ? (
        <EmptyState title={t("ساعتی ثبت نشده")} description={t("با تایمر یا ثبتِ دستی شروع کنید.")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("تاریخ")}</TableHead>
              <TableHead>{t("پروژه")}</TableHead>
              <TableHead>{t("توضیح")}</TableHead>
              <TableHead>{t("مدت")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.logs.map((l) => (
              <TableRow key={l.id}>
                <TableNumericCell>{l.logDate}</TableNumericCell>
                <TableCell>{l.projectTitle ?? <span className="text-muted-foreground">{t("عمومی")}</span>}</TableCell>
                <TableCell className="max-w-64 truncate">{l.description || '—'}</TableCell>
                <TableNumericCell>{hoursLabel(l.minutes)}</TableNumericCell>
                <TableCell className="text-end">
                  {/* ⚠️ بعد از دو هفته ثبت قفل می‌شود — دکمه هم پنهان. */}
                  {l.editable ? (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(l)}>{t("ویرایش")}</Button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (await ask({ title: t('این ساعت حذف شود؟') })) await deleteLogAction(l.id);
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                        aria-label={t("حذف")}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("قفل")}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{tr('ویرایشِ ثبتِ {date}', { date: editing.logDate })}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={edit} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="logId" value={editing.id} />
              <div className="grid gap-1.5">
                <Label htmlFor="e-h">{t("ساعت")}</Label>
                <Input id="e-h" name="hours" type="number" min={0} className="num w-16"
                  defaultValue={Math.floor(editing.minutes / 60)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-m">{t("دقیقه")}</Label>
                <Input id="e-m" name="minutes" type="number" min={0} max={59} className="num w-16"
                  defaultValue={editing.minutes % 60} />
              </div>
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="e-desc">{t("توضیح")}</Label>
                <Input id="e-desc" name="description" defaultValue={editing.description} />
              </div>
              <Submit>{t("ذخیره")}</Submit>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("بستن")}</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
