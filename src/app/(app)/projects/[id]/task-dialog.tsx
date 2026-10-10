'use client';

import { useFreshKey } from '@/hooks/use-fresh-key';
import { UserAvatar, UserName } from '@/components/user-avatar';
import Link from 'next/link';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowLeft, Clapperboard, EyeOff, Lock, Pencil, Share2, Trash2, Package } from 'lucide-react';
import { formatTimestamp } from '@/domain/files/video';
import {
  addTaskNoteAction, deleteTaskAction, loadTaskAction, referTaskAction, updateTaskAction,
  type TaskFormState,
} from '../_form/task-actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox, MultiSelect as SearchableMultiSelect } from '@/components/ui/combobox';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useActionToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { ltr } from '@/i18n/bidi';
import { formatDateTime } from '@/i18n/datetime';
import { useConfirm } from '@/components/ui/confirm';
import { ClaimTaskButton } from '@/app/(app)/tasks/inbox-claim';
import { GROUP_LABEL, TaskStatusPicker } from './task-status-picker';
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { TagChip } from '@/components/ui/tag-chip';
import { RichText } from '@/components/media/rich-text';
import { MediaGallery } from '@/components/media/media-gallery';
import { FormFileDrop } from '@/components/media/form-file-drop';
import { CopyTaskLink, TaskNumber } from '@/components/task-number';

/**
 * مودالِ تسک — بازسازیِ `task_admin_html()`:
 * چیپِ اولویت و وضعیت ← مسئول ← ددلاین ← «آخرین ویرایش توسط» ← توضیحات ←
 * ویرایش/حذف ← گفتگوی تسک با فرمِ یادداشت.
 */

type Loaded = Awaited<ReturnType<typeof loadTaskAction>>;


/** تاریخ/ساعت به وقتِ بیننده — نه UTC ِ خام (`useDateTime`). */
function when(value: Date | string | null | undefined, tz: string): string {
  return formatDateTime(value, tz);
}

function SubmitButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <><Spinner />{busy}</> : label}
    </Button>
  );
}

function TaskDialogBody({
  taskId: requestedId,
  open,
  onOpenChange,
}: {
  taskId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  /**
   * تسکِ نمایش‌داده‌شده — معمولاً همان که فراخوان خواسته، ولی «وابسته به»
   * می‌تواند درجا به تسکِ پیش‌نیاز برود (dash-1 #18). با هر درخواستِ تازه یا
   * بازشدنِ دوباره، به تسکِ خواسته‌شده برمی‌گردد.
   */
  const [taskId, setTaskId] = useState<number | null>(requestedId);
  useEffect(() => { setTaskId(requestedId); }, [requestedId, open]);
  const tr = useT();
  const tz = useTimeZone();
  const t = useT();
  const confirm = useConfirm();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, startDelete] = useTransition();

  const [saveState, saveAction] = useActionState<TaskFormState, FormData>(updateTaskAction, {});
  useActionToast(saveState, { success: 'تغییرات ذخیره شد.' });
  const [noteState, noteAction] = useActionState<TaskFormState, FormData>(addTaskNoteAction, {});

  // هر بار که تسکِ دیگری باز می‌شود از نو بارگذاری می‌کنیم.
  useEffect(() => {
    if (!open || taskId === null) return;
    setData(null);
    setLoadError(null);
    setEditing(false);
    loadTaskAction(taskId)
      .then(setData)
      .catch(() => setLoadError('تسک پیدا نشد یا دسترسی ندارید.'));
  }, [open, taskId]);

  // پس از ذخیره یا یادداشتِ موفق، دوباره بخوان تا صفحه تازه شود.
  useEffect(() => {
    if (!taskId || (!saveState.ok && !noteState.ok)) return;
    loadTaskAction(taskId).then(setData).catch(() => {});
    if (saveState.ok) setEditing(false);
  }, [saveState, noteState, taskId]);

  const task = data?.detail.task;
  const canManage = data?.detail.canManage ?? false;
  // ویرایش/حذف: مدیر یا سازندهٔ تسک؛ ارجاع فقط مدیر.
  const canEdit = data?.detail.canEdit ?? false;
  const options = data?.options ?? null;

  /**
   * وضعیتِ فیلدهای جستجوی زنده — با هر بار خواندنِ تسک از نو مقدار می‌گیرند.
   * ⚠️ داخلِ همان effect ِ بارگذاری نمی‌نشیند، چون `options` (که برچسبِ
   * مسئول از آن می‌آید) در همان لحظه هنوز نیامده است.
   */
  const [assignee, setAssignee] = useState<{ id: number | null; label: string }>({ id: null, label: '' });
  const [roleTagIds, setRoleTagIds] = useState<number[]>([]);
  const [referring, setReferring] = useState(false);
  const [referTo, setReferTo] = useState<{ id: number | null; label: string }>({ id: null, label: '' });
  const [referState, referAction] = useActionState<TaskFormState, FormData>(referTaskAction, {});
  useActionToast(referState, { success: 'ارجاع شد.' });
  useEffect(() => {
    if (!referState.ok || taskId === null) return;
    setReferring(false);
    setReferTo({ id: null, label: '' });
    loadTaskAction(taskId).then(setData).catch(() => {});
  }, [referState, taskId]);
  useEffect(() => {
    if (!data) return;
    const current = data.detail.task.assignedTo;
    setAssignee({
      id: current,
      label: current ? (data.options?.assignees.find((a) => a.userId === current)?.label ?? '') : '',
    });
    setRoleTagIds(data.detail.roles.map((r) => r.roleTagId));
  }, [data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {/* شمارهٔ تسک (۲.۱۶.۰) — کارفرما null می‌گیرد و نمی‌بیند. */}
            <TaskNumber number={task?.number} className="text-xs" />
            {task?.isPrivate && <Lock className="size-4 text-muted-foreground" />}
            <span className="min-w-0 flex-1">{task?.title ?? tr('تسک')}</span>
            {/* ⚠️ فاصله از دکمهٔ بستن (×) که همان گوشه است. */}
            {task?.number ? <span className="me-6 shrink-0"><CopyTaskLink projectId={task.projectId} number={task.number} /></span> : null}
          </DialogTitle>
          <DialogDescription>
            {task ? tr('جزئیات، ویرایش و گفتگوی این تسک.') : tr('در حالِ بارگذاری…')}
          </DialogDescription>
        </DialogHeader>

        {loadError && <p className="text-sm text-destructive">{tr(loadError)}</p>}

        {task && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {task.priorityName && (
                <TagChip color={task.priorityColor}>{task.priorityName}</TagChip>
              )}
              {/*
                ⚠️ وضعیت اینجا **عوض می‌شود**، نه فقط دیده. مودال از صندوقِ
                تسک‌ها هم باز می‌شود و کاربری که کارتِ «در انتظارِ بررسی» را
                می‌خواند باید همان‌جا تأیید یا برگرداند؛ پیش از این باید به
                صفحهٔ پروژه می‌رفت و تسک را دوباره پیدا می‌کرد.
              */}
              <TaskStatusPicker
                task={task}
                options={data?.statuses ?? []}
                canManage={(data?.detail.canInteract ?? false) && (data?.statuses.length ?? 0) > 0}
                onChanged={() => { loadTaskAction(task.id).then(setData).catch(() => {}); }}
              />
              {task.assigneeName && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {tr('مسئول:')}
                  <UserName userId={task.assignedTo} name={task.assigneeName} size="sm" nameClassName="text-foreground" />
                </span>
              )}
              {task.dueDate && (
                <span className="text-xs text-muted-foreground tabular-nums">{tr('ددلاین {date}', { date: ltr(task.dueDate) })}</span>
              )}
            </div>

            {/* پورتِ سطرِ نقش‌ها + «وابسته به» + «این تسک را برمی‌دارم» ِ مودال. */}
            {(data?.detail.roles.length ?? 0) > 0 && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {tr("نقش‌ها")}:
                {data!.detail.roles.map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    {r.roleName ?? ''}
                    {r.claimedByName && <UserName userId={r.claimedBy} name={r.claimedByName} />}
                  </span>
                ))}
              </p>
            )}
            {data?.detail.dependsOnTitle && (
              <p className="text-xs text-muted-foreground">
                {/* ⚠️ فقط وقتی بیننده پیش‌نیاز را می‌بیند عنوانش آمده؛ پس بازکردنش هم مجاز است. */}
                {data.detail.task.dependsOn ? (
                  <button
                    type="button"
                    className="underline-offset-4 hover:text-foreground hover:underline"
                    onClick={() => setTaskId(data.detail.task.dependsOn)}
                  >
                    {tr('وابسته به: {title}', { title: data.detail.dependsOnTitle })}
                  </button>
                ) : tr('وابسته به: {title}', { title: data.detail.dependsOnTitle })}
              </p>
            )}
            {data?.detail.claimable && (
              <ClaimTaskButton
                taskId={task.id}
                projectId={task.projectId}
                onDone={() => { loadTaskAction(task.id).then(setData).catch(() => {}); }}
              />
            )}

            {/* موردِ بازبینی: از کدام بازبینی، کجای ویدئو و کدام بخشِ سایت — با پیوند به خودِ بازبینی. */}
            {(task.reviewId || task.area || task.clientHidden) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {task.reviewId && (
                  <Link
                    href={`/projects/${task.projectId}?tab=reviews&review=${task.reviewId}`}
                    className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    <Clapperboard className="size-3.5" />
                    {tr('از بازبینیِ «{title}»', { title: task.reviewTitle ?? '' })}
                    {task.reviewStart !== null && (
                      <span className="num" dir="ltr">
                        {formatTimestamp(task.reviewStart)}{task.reviewEnd !== null ? `–${formatTimestamp(task.reviewEnd)}` : ''}
                      </span>
                    )}
                  </Link>
                )}
                {task.area && <span>{tr('بخش: {area}', { area: task.area })}</span>}
                {task.unitEntryName && (
                  <span className="inline-flex items-center gap-1"><Package className="size-3.5" />{task.unitEntryName}</span>
                )}
                {task.clientHidden && (
                  <span className="inline-flex items-center gap-1"><EyeOff className="size-3.5" />{tr('پنهان از کارفرما')}</span>
                )}
              </div>
            )}

            {/* «آخرین ویرایش توسط X» — همان سطرِ نسخهٔ قبلی. */}
            {task.updatedByName && (
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {tr('آخرین ویرایش توسط')}
                <UserName userId={task.updatedBy} name={task.updatedByName} />
                <span className="num">· {ltr(when(task.updatedAt, tz))}</span>
              </p>
            )}

            {/* توضیح با پیوندِ کلیک‌پذیر و ویدئوی لوم/یوتیوب، و تصویرهای تسک زیرش. */}
            {(task.description || data.detail.media.length > 0) && (
              <div className="grid gap-3 rounded-md bg-muted/40 p-3">
                <RichText text={task.description} projectId={task.projectId} />
                <MediaGallery
                  items={data.detail.media}
                  projectId={task.projectId}
                  onChanged={() => { loadTaskAction(task.id).then(setData).catch(() => {}); }}
                />
              </div>
            )}

            {/*
              ⚠️ این مودال از دو جا باز می‌شود: صفحهٔ پروژه و صندوقِ تسک‌ها.
              در حالتِ دوم کاربر بیرونِ پروژه است و باید راهی به آن داشته
              باشد — بدونِ این دکمه، «نگاهِ سریع» بن‌بست بود.
            */}
            <div>
              <Button asChild size="sm" variant="ghost" className="px-0 text-primary hover:bg-transparent">
                <Link href={`/projects/${task.projectId}?tab=tasks`}>
                  {tr('رفتن به پروژه')}
                  <ArrowLeft className="ltr:rotate-180" aria-hidden />
                </Link>
              </Button>
            </div>

            {/*
              ⚠️ «ارجاع» ویرایشِ ساده نیست: نیت را ثبت می‌کند — چه کسی، به چه
              کسی، و چرا. یادداشتش در گفتگوی تسک می‌ماند و گیرنده اعلان
              می‌گیرد (`referTask`).
            */}
            {canManage && referring && (
              <form action={referAction} className="grid gap-2 rounded-lg border border-dashed p-3">
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="toUserId" value={referTo.id ?? ''} />
                <span className="text-sm font-medium">{tr("ارجاعِ تسک به شخصِ دیگر")}</span>
                <Combobox
                  options={(options?.assignees ?? []).map((a) => ({ value: a.userId, label: a.label, media: <UserAvatar userId={a.userId} name={a.label} size="xs" /> }))}
                  value={referTo}
                  onChange={setReferTo}
                  placeholder={t("گیرندهٔ ارجاع…")}
                />
                <Input name="referNote" placeholder={t("توضیحِ ارجاع (اختیاری)")} />
                {referState.error && <p className="text-xs text-destructive">{tr(referState.error)}</p>}
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={referTo.id === null}>{t("ارجاع بده")}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setReferring(false)}>
                    {t("انصراف")}
                  </Button>
                </div>
              </form>
            )}

            {canEdit && (
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
                  <Pencil className="size-3.5" />
                  {tr("ویرایش تسک")}
                </Button>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { setReferring((v) => !v); setEditing(false); }}
                  >
                    <Share2 className="size-3.5" />
                    {tr("ارجاع")}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={deleting}
                  onClick={async () => {
                    if (!(await confirm({ title: tr('این تسک حذف شود؟') }))) return;
                    startDelete(async () => {
                      const result = await deleteTaskAction(task.id);
                      if (!result.error) onOpenChange(false);
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {tr("حذف تسک")}
                </Button>
              </div>
            )}

            {editing && options && (
              <form action={saveAction} className="grid gap-3 rounded-lg bg-muted/60 p-3">
                <input type="hidden" name="taskId" value={task.id} />

                <Field>
                  <FieldLabel htmlFor="t-title">{t("عنوان")}</FieldLabel>
                  <Input id="t-title" name="title" defaultValue={task.title} required />
                  {saveState.fieldErrors?.title && (
                    <FieldError>{t(saveState.fieldErrors.title)}</FieldError>
                  )}
                </Field>

                {/* تصویرِ تازه به تصویرهای قبلی **افزوده** می‌شود؛ حذفِ قبلی‌ها از خودِ گالری است. */}
                <FormFileDrop name="media" videoLinks>
                  <Field>
                    <FieldLabel htmlFor="t-desc">{t("توضیحات")}</FieldLabel>
                    <Textarea id="t-desc" name="description" rows={3} defaultValue={task.description} />
                  </Field>
                </FormFileDrop>

                {(options.tasks?.filter((x) => x.id !== task.id).length ?? 0) > 0 && (
                  <Field>
                    <FieldLabel htmlFor="t-depends">{t("وابسته به")}</FieldLabel>
                    <SearchableSelect id="t-depends" name="dependsOn" containerClassName="w-full" defaultValue={task.dependsOn ? String(task.dependsOn) : ''}>
                      <NativeSelectOption value="">—</NativeSelectOption>
                      {options.tasks!.filter((x) => x.id !== task.id).map((x) => (
                        <NativeSelectOption key={x.id} value={x.id}>{x.title}</NativeSelectOption>
                      ))}
                    </SearchableSelect>
                  </Field>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="t-status">{t("وضعیت")}</FieldLabel>
                    <NativeSelect
                      id="t-status"
                      name="statusTagId"
                      containerClassName="w-full"
                      defaultValue={task.statusTagId ? String(task.statusTagId) : ''}
                    >
                      <NativeSelectOption value="">{t("— بدون وضعیت —")}</NativeSelectOption>
                      {/* گروه‌بندی با گروهِ وضعیت — همان سرگروه‌های تبِ تسک‌ها و منوی وضعیت (dash-1 #22). */}
                      {['todo', 'in_progress', 'complete', 'other'].map((g) => {
                        const inGroup = options.statuses.filter((s) => (s.group && GROUP_LABEL[s.group] ? s.group : 'other') === g);
                        return inGroup.length === 0 ? null : (
                          <NativeSelectOptGroup key={g} label={tr(GROUP_LABEL[g] ?? g)}>
                            {inGroup.map((s) => (
                              <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>
                            ))}
                          </NativeSelectOptGroup>
                        );
                      })}
                    </NativeSelect>
                  </Field>

                  {/* جستجوی زنده — همان دلیلِ فرمِ افزودن: فهرستِ بلند. */}
                  <Field>
                    <FieldLabel htmlFor="t-assignee">{t("تخصیص به…")}</FieldLabel>
                    <Combobox
                      id="t-assignee"
                      name="assignedTo"
                      options={options.assignees.map((a) => ({ value: a.userId, label: a.label, media: <UserAvatar userId={a.userId} name={a.label} size="xs" /> }))}
                      value={assignee}
                      onChange={setAssignee}
                      placeholder={t("نامِ عضو را تایپ کنید…")}
                    />
                  </Field>

                  {/*
                    ⚠️ نقش‌ها در ویرایش — پیش از این فرمِ ویرایش انتخابگرِ نقش نداشت و
                    سرور هم نمی‌نوشتشان؛ نقشِ تسک بعد از ساخت غیرقابلِ تغییر بود.
                    و وقتی تسک به شخص سپرده شده، نقش کنار می‌رود (همان قاعدهٔ فرمِ افزودن).
                  */}
                  {options.roles.length > 0 && (
                    <Field>
                      <FieldLabel htmlFor="t-roles">{t("تخصیص به نقش")}</FieldLabel>
                      {assignee.id !== null ? (
                        <p className="flex h-9 items-center text-xs text-muted-foreground">
                          {tr("به شخص سپرده شده — نقش لازم نیست")}
                        </p>
                      ) : (
                        <SearchableMultiSelect
                          id="t-roles"
                          name="roleTagIds"
                          options={options.roles.map((r) => ({ value: r.id, label: r.name }))}
                          selected={roleTagIds}
                          onChange={setRoleTagIds}
                          placeholder={t("نقش‌ها…")}
                        />
                      )}
                    </Field>
                  )}

                  <Field>
                    <FieldLabel htmlFor="t-priority">{t("اولویت…")}</FieldLabel>
                    <NativeSelect
                      id="t-priority"
                      name="priorityTagId"
                      containerClassName="w-full"
                      defaultValue={task.priorityTagId ? String(task.priorityTagId) : ''}
                    >
                      <NativeSelectOption value="">—</NativeSelectOption>
                      {options.priorities.map((p) => (
                        <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>

                </div>

                {/* ددلاین و «بخش» کنارِ هم در یک ردیف (همان چیدمانِ فرمِ افزودن). */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="t-due">{t("ددلاین")}</FieldLabel>
                    <DatePicker
                      id="t-due"
                      name="dueDate"
                      defaultValue={task.dueDate ?? ''}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="t-area">{t("بخش")}</FieldLabel>
                    <Input id="t-area" name="area" defaultValue={task.area} placeholder={t("مثلاً هدر، فوتر، صفحهٔ تماس")} maxLength={120} />
                  </Field>
                  {/* ردیفِ کارکرد (۲.۲۲.۰) — فقط در پروژهٔ تعدادی که ردیفِ نام‌دار دارد. */}
                  {(options.unitEntries?.length ?? 0) > 0 && (
                    <Field>
                      <FieldLabel htmlFor="t-unit">{t("ردیفِ کارکرد")}</FieldLabel>
                      <NativeSelect id="t-unit" name="unitEntryId" containerClassName="w-full" defaultValue={task.unitEntryId ? String(task.unitEntryId) : ''}>
                        <NativeSelectOption value="">{t("— هیچ‌کدام —")}</NativeSelectOption>
                        {options.unitEntries!.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}
                      </NativeSelect>
                    </Field>
                  )}
                  {/* زمانِ ویدئو فقط برای موردِ بازبینی. */}
                  {task.reviewId && (
                    <Field>
                      <FieldLabel htmlFor="t-start">{t("زمانِ ویدئو (از – تا)")}</FieldLabel>
                      <div className="flex items-center gap-2" dir="ltr">
                        <Input id="t-start" name="reviewStart" className="num" placeholder="1:23"
                          defaultValue={task.reviewStart !== null ? formatTimestamp(task.reviewStart) : ''} />
                        <span className="text-muted-foreground">–</span>
                        <Input name="reviewEnd" className="num" placeholder="1:40" aria-label={t("پایان")}
                          defaultValue={task.reviewEnd !== null ? formatTimestamp(task.reviewEnd) : ''} />
                      </div>
                    </Field>
                  )}
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="isPrivate" value="1" defaultChecked={task.isPrivate} />
                  {tr("تسکِ خصوصی (فقط سازنده، مسئول و مدیران)")}
                </label>
                {/* ⚠️ فقط مدیر؛ سرور هم از دیگران نادیده‌اش می‌گیرد. نشانگر یعنی «این فرم فیلد را دارد». */}
                {canManage && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="hidden" name="clientHiddenField" value="1" />
                    <Checkbox name="clientHidden" value="1" defaultChecked={task.clientHidden} />
                    {tr("پنهان از کارفرما")}
                  </label>
                )}

                {saveState.error && <p className="text-xs text-destructive">{tr(saveState.error)}</p>}
                <div className="flex justify-end">
                  <SubmitButton label={t("ذخیرهٔ تغییرات")} busy={t('در حالِ ذخیره…')} />
                </div>
              </form>
            )}

            <section className="grid gap-2">
              <h4 className="text-sm font-semibold">{t("گفتگوی تسک")}</h4>
              {data.detail.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("هنوز گفتگویی نیست.")}</p>
              ) : (
                <ul className="grid gap-2">
                  {data.detail.notes.map((n) => (
                    <li key={n.id} className="grid gap-2 rounded-lg bg-muted/60 p-2.5">
                      {/* نویسنده بالای پیام، مثلِ گفتگو — چهره زودتر از نام خوانده می‌شود. */}
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <UserName userId={n.userId} name={n.userName ?? '—'} size="sm" nameClassName="font-medium text-foreground" />
                        <span className="num">{when(n.createdAt, tz)}</span>
                      </p>
                      <RichText text={n.body} projectId={task.projectId} />
                      <MediaGallery
                        items={n.media}
                        projectId={task.projectId}
                        size="sm"
                        onChanged={() => { loadTaskAction(task.id).then(setData).catch(() => {}); }}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {/* ⚠️ همکارِ فقط‌خواندنی یادداشت نمی‌نویسد (سرور هم رد می‌کند) — فرم را نبیند. */}
              {(data?.detail.canInteract ?? true) && (
              <form action={noteAction} className="grid gap-2">
                <input type="hidden" name="taskId" value={task.id} />
                {/* ⚠️ متن اجباری نیست: یادداشتِ فقط‌اسکرین‌شات هم یادداشت است (سرور هر دو خالی را رد می‌کند). */}
                <FormFileDrop name="media" compact videoLinks>
                  <Textarea name="body" rows={2} placeholder={t("یادداشت/توضیح بنویسید…")} />
                </FormFileDrop>
                {noteState.error && <p className="text-xs text-destructive">{tr(noteState.error)}</p>}
                <div className="flex justify-end">
                  <SubmitButton label={t("ارسال")} busy={t('در حال ارسال…')} />
                </div>
              </form>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * ⚠️ بدنه با هر بار باز شدن از نو ساخته می‌شود (`useFreshKey`، ۲.۱۷.۱) — تغییرِ
 * ذخیره‌نشده با بستنِ پنجره دور ریخته می‌شود، نه اینکه دفعهٔ بعد سرِ جایش بماند.
 */
export function TaskDialog(props: Parameters<typeof TaskDialogBody>[0]) {
  const key = useFreshKey(props.open);
  return <TaskDialogBody key={key} {...props} />;
}
