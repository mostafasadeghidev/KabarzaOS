'use client';

import { UserAvatar, UserName } from '@/components/user-avatar';
import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarDays, CircleCheck, ExternalLink, Paperclip, Plus, RefreshCw, RotateCcw, Trash2, UserRound, Wrench } from 'lucide-react';
import { RichText } from '@/components/media/rich-text';
import { LinkCard } from '@/components/media/link-card';
import { MediaGallery, type MediaEntry } from '@/components/media/media-gallery';
import {
  addCustomTaskAction, deleteTaskAction, startOnboardingAction, toggleTaskAction, type OnboardingState,
} from './_form/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useActionToast, useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useT } from '@/i18n/client';
import { ltr } from '@/i18n/bidi';
import { cn } from '@/lib/utils';
import { KINDS, KIND_LABELS, type OnboardingKind, type TaskState } from '@/domain/onboarding/plan';

/** یک کارِ چک‌لیست همان‌طور که سرور می‌فرستد (`TaskView`). */
export interface TaskItem {
  id: number;
  userId: number;
  title: string;
  description: string;
  kind: OnboardingKind;
  link: string;
  dueDate: string;
  state: TaskState;
  assigneeUserId: number | null;
  assigneeName: string | null;
  doneBy?: number | null;
  doneByName: string | null;
  serviceName: string | null;
  hasGrant: boolean;
  canTick: boolean;
  /** فقط در فهرستِ «با شما» — این کار مالِ آنبوردینگِ چه کسی است. */
  personName?: string;
  /** فایل‌های راهنمای آیتمِ کتابخانه (۲.۶.۰). */
  media: MediaEntry[];
}

const STATE_BADGE: Record<TaskState, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  done: { label: 'انجام شد', variant: 'success' },
  overdue: { label: 'عقب‌افتاده', variant: 'warning' },
  open: { label: 'باز', variant: 'secondary' },
};

/**
 * فهرستِ کارها با تیک. ⚠️ تیک فقط وقتی فعال است که سرور اجازه داده
 * (`canTick`) — عضو کارِ دیگران را تیک نمی‌زند؛ به‌جایش «در انتظارِ …» می‌بیند.
 */
export function TaskRows({ tasks, canDelete = false, showPerson = false, memberId = null }: {
  tasks: TaskItem[];
  canDelete?: boolean;
  showPerson?: boolean;
  /** صاحبِ چک‌لیست — برای اینکه «خودت» به‌جای نامِ خودِ او نوشته شود. */
  memberId?: number | null;
}) {
  const tr = useT();
  const { show } = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const toggle = (task: TaskItem, done: boolean) => startTransition(async () => {
    const result = await toggleTaskAction(task.id, done);
    if (result.error) show(tr(result.error), 'error');
  });

  const remove = async (task: TaskItem) => {
    if (!(await confirm({ title: tr('این کار حذف شود؟'), description: task.title }))) return;
    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      if (result.error) show(tr(result.error), 'error');
    });
  };

  const who = (t: TaskItem) => {
    if (t.assigneeUserId !== null && t.assigneeUserId === memberId) return tr('خودت');
    return t.assigneeName ?? tr('مدیرانِ اعضا');
  };

  /** کاری که مودالِ جزئیاتش باز است — شناسه، تا پس از تیک دادهٔ تازه را نشان دهد. */
  const [openId, setOpenId] = useState<number | null>(null);
  const opened = tasks.find((t) => t.id === openId) ?? null;

  return (
    <>
    <ul className="grid gap-2">
      {tasks.map((t) => {
        // کارِ بازی که تیکش با دیگری است — برای عضو «در انتظارِ مسئول»، نه «باز».
        const badge = !t.canTick && t.state !== 'done'
          ? { label: 'در انتظارِ مسئول', variant: t.state === 'overdue' ? 'warning' as const : 'secondary' as const }
          : STATE_BADGE[t.state];
        return (
          <li
            key={t.id}
            className={cn('flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5', t.state === 'done' && 'bg-muted/40')}
          >
            <Checkbox
              className="mt-0.5"
              checked={t.state === 'done'}
              disabled={!t.canTick || pending}
              onCheckedChange={(v) => toggle(t, v === true)}
              aria-label={t.title}
            />
            <div className="grid min-w-0 flex-1 gap-0.5">
              {/* عنوان مودالِ جزئیات را باز می‌کند (۲.۶.۰) — توضیحِ کامل، پیوند و فایل‌های راهنما. */}
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                className={cn(
                  'flex w-fit items-center gap-1.5 rounded-sm text-start text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  t.state === 'done' && 'text-muted-foreground line-through',
                )}
              >
                {t.title}
                {t.media.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground no-underline">
                    <Paperclip className="size-3" aria-hidden /><span className="num">{t.media.length}</span>
                  </span>
                )}
              </button>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>{tr(KIND_LABELS[t.kind])}</span>
                {t.serviceName && <span>· {t.serviceName}</span>}
                {showPerson && t.personName && (
                  <span className="inline-flex items-center gap-1">· <Link href={`/onboarding/${t.userId}`} className="underline"><UserName userId={t.userId} name={t.personName} /></Link></span>
                )}
                <span className="inline-flex items-center gap-1">
                  · {tr('با:')}
                  {t.assigneeUserId !== null ? <UserName userId={t.assigneeUserId} name={who(t)} /> : who(t)}
                </span>
                <span>· {tr('موعد: {date}', { date: ltr(t.dueDate) })}</span>
                {t.state === 'done' && t.doneByName && (
                  <span className="inline-flex items-center gap-1">· {tr('انجام شد توسط')} <UserName userId={t.doneBy} name={t.doneByName} /></span>
                )}
                {t.hasGrant && <span>· {tr('در سیاههٔ دسترسی ثبت شد')}</span>}
              </span>
              {t.description && <p className="line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">{t.description}</p>}
              {t.link && (
                <a href={t.link} target="_blank" rel="noopener noreferrer nofollow" className="flex w-fit items-center gap-1 text-xs underline">
                  <ExternalLink className="size-3" />{tr('باز کردنِ پیوند')}
                </a>
              )}
            </div>
            <Badge variant={badge.variant} className="shrink-0">{tr(badge.label)}</Badge>
            {canDelete && (
              <IconButton variant="ghost" className="size-7 shrink-0" label={tr('حذف')} onClick={() => remove(t)} disabled={pending}>
                <Trash2 className="size-3.5" />
              </IconButton>
            )}
          </li>
        );
      })}
    </ul>
    <TaskDetailDialog
      task={opened}
      onClose={() => setOpenId(null)}
      who={opened ? who(opened) : ''}
      pending={pending}
      onToggle={(task, done) => toggle(task, done)}
    />
    </>
  );
}

/**
 * جزئیاتِ یک کارِ آنبوردینگ (۲.۶.۰) — همه‌چیز مرتب در یک جا: نوع و وضعیت،
 * انجام‌دهنده و موعد، توضیحِ کامل (ویدئوی لینک‌شده همان‌جا پخش می‌شود)،
 * پیوند و فایل‌های راهنما. تیک هم همین‌جاست — با همان اجازهٔ فهرست (`canTick`).
 */
function TaskDetailDialog({ task, onClose, who, pending, onToggle }: {
  task: TaskItem | null;
  onClose: () => void;
  who: string;
  pending: boolean;
  onToggle: (task: TaskItem, done: boolean) => void;
}) {
  const tr = useT();
  const badge = task && (!task.canTick && task.state !== 'done'
    ? { label: 'در انتظارِ مسئول', variant: task.state === 'overdue' ? 'warning' as const : 'secondary' as const }
    : STATE_BADGE[task.state]);
  return (
    <Dialog open={task !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {task && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pe-6">
                {task.title}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{tr(KIND_LABELS[task.kind])}</Badge>
                {badge && <Badge variant={badge.variant}>{tr(badge.label)}</Badge>}
                {task.hasGrant && <Badge variant="secondary">{tr('در سیاههٔ دسترسی ثبت شد')}</Badge>}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
              <div className="grid gap-0.5">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="size-3.5" aria-hidden />{tr('انجام‌دهنده')}</dt>
                <dd>{task.assigneeUserId !== null ? <UserName userId={task.assigneeUserId} name={who} /> : who}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden />{tr('موعد')}</dt>
                <dd className="num">{ltr(task.dueDate)}</dd>
              </div>
              {task.personName && (
                <div className="grid gap-0.5">
                  <dt className="text-xs text-muted-foreground">{tr('عضوِ تازه')}</dt>
                  <dd><UserName userId={task.userId} name={task.personName} /></dd>
                </div>
              )}
              {task.serviceName && (
                <div className="grid gap-0.5">
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground"><Wrench className="size-3.5" aria-hidden />{tr('سرویس')}</dt>
                  <dd>{task.serviceName}</dd>
                </div>
              )}
              {task.state === 'done' && task.doneByName && (
                <div className="grid gap-0.5">
                  <dt className="flex items-center gap-1 text-xs text-muted-foreground"><CircleCheck className="size-3.5" aria-hidden />{tr('انجام شد توسط')}</dt>
                  <dd><UserName userId={task.doneBy} name={task.doneByName} /></dd>
                </div>
              )}
            </dl>

            {task.description && (
              <section className="grid gap-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">{tr('توضیحات')}</h3>
                <RichText text={task.description} />
              </section>
            )}

            {task.link && (
              <section className="grid gap-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">{tr('پیوند')}</h3>
                <LinkCard href={task.link} label={null} />
              </section>
            )}

            {task.media.length > 0 && (
              <section className="grid gap-1.5">
                <h3 className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Paperclip className="size-3.5" aria-hidden />{tr('فایل‌های راهنما')}
                </h3>
                <MediaGallery items={task.media} projectId={0} size="lg" />
              </section>
            )}

            {task.canTick && (
              <DialogFooter>
                {task.state === 'done' ? (
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onToggle(task, false)}>
                    <RotateCcw className="size-3.5" />{tr('برگرداندن به باز')}
                  </Button>
                ) : (
                  <Button type="button" size="sm" disabled={pending} onClick={() => onToggle(task, true)}>
                    <CircleCheck className="size-3.5" />{tr('انجام شد')}
                  </Button>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** «شروعِ آنبوردینگ» / «همگام‌سازی با کتابخانه» — یک اقدام، هر دو کار. */
export function StartButton({ userId, started }: { userId: number; started: boolean }) {
  const tr = useT();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button" size="sm" variant={started ? 'outline' : 'default'} disabled={pending}
      onClick={() => startTransition(async () => {
        const result = await startOnboardingAction(userId);
        show(tr(result.error ?? result.message ?? '', result.params), result.error ? 'error' : 'success');
      })}
    >
      <RefreshCw className="size-3.5" />
      {started ? tr('همگام‌سازی با کتابخانه') : tr('شروعِ آنبوردینگ')}
    </Button>
  );
}

/** شروع برای عضوی که هنوز چک‌لیست ندارد — از صفحهٔ آنبوردینگ. */
export function StartPicker({ candidates }: { candidates: Array<{ id: number; name: string }> }) {
  const tr = useT();
  const { show } = useToast();
  const [userId, setUserId] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field className="w-64">
        <FieldLabel htmlFor="ob-start">{tr('عضو')}</FieldLabel>
        <SearchableSelect
          id="ob-start" value={userId} onValueChange={setUserId} containerClassName="w-full"
          renderMedia={(v) => <UserAvatar userId={Number(v)} name={candidates.find((c) => String(c.id) === v)?.name} size="xs" />}
        >
          <NativeSelectOption value="">{tr('انتخاب کنید')}</NativeSelectOption>
          {candidates.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
        </SearchableSelect>
      </Field>
      <Button
        type="button" size="sm" disabled={!userId || pending}
        onClick={() => startTransition(async () => {
          const result = await startOnboardingAction(Number(userId));
          show(tr(result.error ?? result.message ?? '', result.params), result.error ? 'error' : 'success');
          if (!result.error) setUserId('');
        })}
      >
        {tr('شروعِ آنبوردینگ')}
      </Button>
    </div>
  );
}

/** آیتمِ ویژهٔ همین نفر — بیرون از کتابخانه. */
export function AddTaskDialog({ userId, people, services, today }: {
  userId: number;
  people: Array<{ id: number; name: string }>;
  services: Array<{ id: number; name: string }>;
  today: string;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<OnboardingKind>('task');
  const [state, action] = useActionState(async (prev: OnboardingState, form: FormData) => {
    const result = await addCustomTaskAction(prev, form);
    if (result.message) setOpen(false);
    return result;
  }, {});
  useActionToast(state);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />{tr('آیتمِ ویژهٔ این نفر')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr('آیتمِ ویژهٔ این نفر')}</DialogTitle></DialogHeader>
          <form action={action} className="grid gap-3">
            <input type="hidden" name="userId" value={userId} />
            <Field>
              <FieldLabel htmlFor="ot-title">{tr('عنوان')}</FieldLabel>
              <Input id="ot-title" name="title" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ot-kind">{tr('نوع')}</FieldLabel>
                <NativeSelect id="ot-kind" name="kind" containerClassName="w-full" value={kind} onChange={(e) => setKind(e.target.value as OnboardingKind)}>
                  {KINDS.map((k) => <NativeSelectOption key={k} value={k}>{tr(KIND_LABELS[k])}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="ot-due">{tr('موعد')}</FieldLabel>
                <DatePicker id="ot-due" name="dueDate" defaultValue={today} required />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ot-who">{tr('انجام‌دهنده')}</FieldLabel>
              <SearchableSelect
                id="ot-who" name="assigneeUserId" containerClassName="w-full" defaultValue={String(userId)}
                renderMedia={(v) => <UserAvatar userId={Number(v)} name={people.find((p) => String(p.id) === v)?.name} size="xs" />}
              >
                <NativeSelectOption value="">{tr('مدیرانِ اعضا')}</NativeSelectOption>
                {people.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>)}
              </SearchableSelect>
            </Field>
            {kind === 'access' && (
              <Field>
                <FieldLabel htmlFor="ot-service">{tr('سرویس')}</FieldLabel>
                <SearchableSelect
                  id="ot-service" name="serviceId" containerClassName="w-full" required defaultValue=""
                  createName="newServiceName" searchPlaceholder={tr('جستجو یا نامِ سرویسِ تازه…')}
                >
                  <NativeSelectOption value="">{tr('انتخاب کنید')}</NativeSelectOption>
                  {services.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}
                </SearchableSelect>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="ot-link">{tr('پیوند (اختیاری)')}</FieldLabel>
              <Input id="ot-link" name="link" dir="ltr" placeholder="https://…" />
            </Field>
            <Field>
              <FieldLabel htmlFor="ot-desc">{tr('توضیحات')}</FieldLabel>
              <Textarea id="ot-desc" name="description" rows={2} />
            </Field>
            <DialogFooter>
              <Button type="submit" size="sm">{tr('افزودن')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
