'use client';

import { UserAvatar, UserName } from '@/components/user-avatar';
import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
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

  return (
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
              <span className={cn('text-sm font-medium', t.state === 'done' && 'text-muted-foreground line-through')}>
                {t.title}
              </span>
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
              {t.description && <p className="text-xs whitespace-pre-line text-muted-foreground">{t.description}</p>}
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
        show(tr(result.error ?? result.message ?? ''), result.error ? 'error' : 'success');
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
          show(tr(result.error ?? result.message ?? ''), result.error ? 'error' : 'success');
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
