'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { CalendarDays, MapPin, Plus, Trash2, Users } from 'lucide-react';
import {
  deleteMeetingAction, deleteReminderAction, saveReminderAction, type SimpleState,
} from './_form/actions';
import { MeetingForm, type MeetingFormOptions, type MeetingView } from './meeting-form';
import { LEAD_OPTIONS, leadLabel } from '@/domain/meetings/reminders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { useConfirm } from '@/components/ui/confirm';
import { CalendarMenu } from './calendar-menu';

export interface MeetingRow extends MeetingView {
  projectTitle: string | null;
  officeName: string | null;
  meetingScope: 'project' | 'general';
  /** سازنده، مدیرِ پروژه‌اش، یا مدیرِ سراسری — از سرور. */
  canEdit: boolean;
}

export interface ReminderRow {
  id: number;
  remindAt: Date | string;
  body: string;
  leadMinutes: number[] | null;
  isSent: boolean;
}

/** تاریخ و ساعتِ خوانا — همیشه چپ‌به‌راست تا در متنِ فارسی نشکند. */
/** تاریخ/ساعت به وقتِ بیننده — نه UTC ِ خام (`useDateTime`). */
function when(value: Date | string | null | undefined, tz: string): string {
  return formatDateTime(value, tz);
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? '…' : label}</Button>;
}

/**
 * صفحهٔ جلسات — دو تبِ نسخهٔ قبلی: «جلسات» و «یادآورهای من».
 * ⚠️ یادآور شخصی است: مجوزِ بخش نمی‌خواهد و هر کس فقط مالِ خودش را می‌بیند.
 */
export function MeetingsView({
  meetings,
  reminders,
  options,
  canManage,
  canCreateGeneral,
  initialTab = 'meetings',
}: {
  meetings: MeetingRow[];
  reminders: ReminderRow[];
  options: MeetingFormOptions;
  /** می‌تواند جلسه‌ای بسازد (سراسری، مدیرِ پروژه یا مدیرِ دفتر). */
  canManage: boolean;
  /** جلسهٔ عمومی (بدونِ پروژه) — فقط مالک/مدیرِ بخش و مدیرِ دفتر. */
  canCreateGeneral: boolean;
  initialTab?: 'meetings' | 'reminders';
}) {
  const tr = useT();
  const tz = useTimeZone();
  const { show } = useToast();
  const t = useT();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'meetings' | 'reminders'>(initialTab);
  const [editing, setEditing] = useState<MeetingView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  /** جلسه‌ای که جزئیاتش باز است. */
  const [detail, setDetail] = useState<MeetingRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [reminderState, reminderAction] = useActionState<SimpleState, FormData>(saveReminderAction, {});

  const run = (fn: () => Promise<SimpleState>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) show(tr(result.error), 'error');
      else show(tr('حذف شد.'), 'success');
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(['meetings', 'reminders'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                tab === key ? 'bg-primary/10 font-medium' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {key === 'meetings' ? tr('جلسات') : tr('یادآورهای من')}
            </button>
          ))}
        </div>

        {tab === 'meetings' && canManage && (
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="size-4" />
            {tr("جلسهٔ جدید")}
          </Button>
        )}
      </div>


      {tab === 'meetings' ? (
        meetings.length === 0 ? (
          <EmptyState title={t("جلسه‌ای پیشِ‌رو ندارید.")} />
        ) : (
          <div className="grid gap-3 @3xl/main:grid-cols-2">
            {meetings.map((m) => (
              /**
               * ⚠️ کلِ کارت جزئیات را باز می‌کند: توضیحاتِ جلسه روی کارت جا
               * نمی‌شد (و اصلاً چاپ نمی‌شد)، و فهرستِ دعوت‌شدگان در یک خطِ
               * درهم می‌رفت. کارت خلاصه است، مودال کاملِ ماجرا. کلیک روی
               * دکمه‌های داخلِ کارت بالا نمی‌آید (`data-stop`).
               */
              <Card
                key={m.id}
                onClick={() => setDetail(m)}
                className="cursor-pointer gap-2 py-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <CardContent className="grid gap-2 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{m.title}</p>
                      <p className="num mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="size-3" />
                        {when(m.meetAt, tz)}
                      </p>
                    </div>
                    <Badge variant={m.meetingScope === 'project' ? 'secondary' : 'outline'}>
                      {m.meetingScope === 'project' ? (m.projectTitle ?? tr('پروژه')) : (m.officeName ?? tr('عمومی'))}
                    </Badge>
                  </div>

                  {m.location && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {m.location}
                    </p>
                  )}

                  {m.attendees.length > 0 && (
                    <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {m.attendees.map((a) => a.name).join(tr('، '))}
                    </p>
                  )}

                  <div className="flex justify-end gap-1" data-stop onClick={(e) => e.stopPropagation()}>
                    {/*
                      ⚠️ «افزودن به تقویم» برای **همه** است، نه فقط مدیر —
                      دعوت‌شده باید بتواند جلسه را در تقویمِ خودش بگذارد.
                      گاردِ واقعی در مسیرِ سرور است (R-ARCH-01).
                    */}
                    <CalendarMenu
                      meetingId={m.id}
                      title={m.title}
                      description={m.description ?? ''}
                      location={m.location ?? ''}
                      meetAt={m.meetAt}
                    />
                  </div>

                  {m.canEdit && (
                    <div className="flex justify-end gap-1" data-stop onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditing(m); setFormOpen(true); }}
                      >
                        {tr("ویرایش")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={pending}
                        onClick={async () => {
                          if (await confirm({ title: tr('این جلسه حذف شود؟') })) run(() => deleteMeetingAction(m.id));
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        {tr("حذف")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="grid max-w-3xl gap-4">
          <form action={reminderAction} className="grid gap-3 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              {tr("یک یادداشت برای زمانی در آینده تنظیم کنید؛ سرِ موعد به شما یادآوری می‌شود.")}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="r-at">{t("تاریخ و ساعت")}</Label>
                <Input id="r-at" type="datetime-local" name="remindAt" className="num" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="r-body">{t("متن یادآور")}</Label>
                <Input id="r-body" name="body" placeholder={t("مثلاً: تماس با کارفرما")} required />
              </div>
            </div>

            <fieldset className="grid gap-1.5">
              <legend className="text-sm">{t("چه زمانی یادآوری شود؟ (می‌توانید چند مورد را انتخاب کنید)")}</legend>
              <div className="flex flex-wrap gap-3">
                {LEAD_OPTIONS.map((o) => (
                  <label key={o.minutes} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="leads"
                      value={o.minutes}
                      defaultChecked={o.minutes === 0}
                      className="size-4 accent-primary"
                    />
                    {tr(o.label)}
                  </label>
                ))}
              </div>
            </fieldset>

            {reminderState.error && (
              <p className="text-xs text-destructive">{tr(reminderState.error)}</p>
            )}
            <div>
              <SubmitButton label={t("ثبت یادآور")} />
            </div>
          </form>

          {reminders.length === 0 ? (
            <EmptyState title={t("یادآوری ندارید.")} />
          ) : (
            <ul className="grid gap-2">
              {reminders.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="text-sm">{r.body}</p>
                    <p className="num mt-0.5 text-xs text-muted-foreground">{when(r.remindAt, tz)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {(r.leadMinutes ?? [0]).map((m) => leadLabel(m, tr)).join(tr('، '))}
                    </span>
                    <Badge variant={r.isSent ? 'success' : 'secondary'}>
                      {r.isSent ? tr('ارسال‌شده') : tr('در انتظار')}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label={t("حذفِ یادآور")}
                      disabled={pending}
                      onClick={async () => {
                        if (await confirm({ title: t('این یادآور حذف شود؟') })) run(() => deleteReminderAction(r.id));
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canManage && (
        <MeetingForm
          open={formOpen}
          onOpenChange={setFormOpen}
          meeting={editing}
          options={options}
        canCreateGeneral={canCreateGeneral}
        />
      )}

      {/* جزئیاتِ جلسه — خط به خط، نه فشرده در یک کارت. */}
      <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.title ?? ''}</DialogTitle>
            <DialogDescription>
              {detail?.meetingScope === 'project'
                ? tr('جلسهٔ پروژه: {name}', { name: detail?.projectTitle ?? tr('بدونِ نام') })
                : tr('جلسهٔ عمومی: {name}', { name: detail?.officeName ?? tr('همهٔ دفاتر') })}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <dl className="grid gap-3 text-sm">
              <div className="grid gap-1">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  {t('تاریخ و ساعت')}
                </dt>
                <dd className="num">{when(detail.meetAt, tz)}</dd>
              </div>

              <div className="grid gap-1">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {t('مکان')}
                </dt>
                {/* لینکِ جلسهٔ آنلاین قابلِ کلیک باشد، نه متنِ خام. */}
                <dd className="break-all">
                  {detail.location
                    ? (/^https?:\/\//.test(detail.location)
                      ? (
                        <a
                          href={detail.location}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {detail.location}
                        </a>
                      )
                      : detail.location)
                    : <span className="text-muted-foreground">—</span>}
                </dd>
              </div>

              <div className="grid gap-1">
                <dt className="text-xs text-muted-foreground">{t('توضیحات')}</dt>
                <dd className="whitespace-pre-wrap">
                  {detail.description
                    ? detail.description
                    : <span className="text-muted-foreground">{t('توضیحی ثبت نشده.')}</span>}
                </dd>
              </div>

              <div className="grid gap-1">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3.5" />
                  {tr('دعوت‌شدگان ({n})', { n: detail.attendees.length })}
                </dt>
                <dd>
                  {detail.attendees.length === 0 ? (
                    <span className="text-muted-foreground">{t('کسی دعوت نشده.')}</span>
                  ) : (
                    <ul className="grid gap-1">
                      {detail.attendees.map((a) => (
                        <li key={a.userId} className="rounded-md bg-muted/50 px-2 py-1 text-xs">{a.name}</li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>
          )}

          <DialogFooter>
            {detail && (
              <CalendarMenu
                meetingId={detail.id}
                title={detail.title}
                description={detail.description ?? ''}
                location={detail.location ?? ''}
                meetAt={detail.meetAt}
              />
            )}
            <Button type="button" variant="outline" onClick={() => setDetail(null)}>{t('بستن')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
