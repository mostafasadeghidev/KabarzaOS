'use client';

import Link from 'next/link';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Lock, Pencil, Share2, Trash2 } from 'lucide-react';
import {
  addTaskNoteAction, deleteTaskAction, loadTaskAction, referTaskAction, updateTaskAction,
  type TaskFormState,
} from '../_form/task-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox, MultiSelect as SearchableMultiSelect } from '@/components/ui/combobox';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useActionToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { useConfirm } from '@/components/ui/confirm';
import { ClaimTaskButton } from '@/app/(app)/tasks/inbox-claim';
import { chipStyle } from '@/domain/ui/contrast';
import { TaskStatusPicker } from './task-status-picker';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { DatePicker } from '@/components/ui/date-picker';

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
      {pending ? busy : label}
    </Button>
  );
}

export function TaskDialog({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
            {task?.isPrivate && <Lock className="size-4 text-muted-foreground" />}
            {task?.title ?? tr('تسک')}
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
                <Badge variant="outline" style={chipStyle(task.priorityColor)}>{task.priorityName}</Badge>
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
                <span className="text-xs text-muted-foreground">{tr('مسئول: {name}', { name: task.assigneeName })}</span>
              )}
              {task.dueDate && (
                <span className="num text-xs text-muted-foreground">{tr('ددلاین {date}', { date: task.dueDate })}</span>
              )}
            </div>

            {/* پورتِ سطرِ نقش‌ها + «وابسته به» + «این تسک را برمی‌دارم» ِ مودال. */}
            {(data?.detail.roles.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                {tr("نقش‌ها")}: {data!.detail.roles.map((r) =>
                  r.claimedByName ? `${r.roleName ?? ''} (${r.claimedByName})` : (r.roleName ?? '')).join(tr('، '))}
              </p>
            )}
            {data?.detail.dependsOnTitle && (
              <p className="text-xs text-muted-foreground">{tr('وابسته به: {title}', { title: data.detail.dependsOnTitle })}</p>
            )}
            {data?.detail.claimable && (
              <ClaimTaskButton
                taskId={task.id}
                projectId={task.projectId}
                onDone={() => { loadTaskAction(task.id).then(setData).catch(() => {}); }}
              />
            )}

            {/* «آخرین ویرایش توسط X» — همان سطرِ نسخهٔ قبلی. */}
            {task.updatedByName && (
              <p className="text-xs text-muted-foreground">
                {tr('آخرین ویرایش توسط {name} · {at}', {
                  name: task.updatedByName ?? '',
                  at: when(task.updatedAt, tz),
                })}
              </p>
            )}

            {task.description && (
              <p className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">{task.description}</p>
            )}

            {/*
              ⚠️ این مودال از دو جا باز می‌شود: صفحهٔ پروژه و صندوقِ تسک‌ها.
              در حالتِ دوم کاربر بیرونِ پروژه است و باید راهی به آن داشته
              باشد — بدونِ این دکمه، «نگاهِ سریع» بن‌بست بود.
            */}
            <div>
              <Button asChild size="sm" variant="ghost" className="px-0 text-primary hover:bg-transparent">
                <Link href={`/projects/${task.projectId}?tab=tasks`}>
                  {tr('رفتن به پروژه')} →
                </Link>
              </Button>
            </div>

            {/*
              ⚠️ «ارجاع» ویرایشِ ساده نیست: نیت را ثبت می‌کند — چه کسی، به چه
              کسی، و چرا. یادداشتش در گفتگوی تسک می‌ماند و گیرنده اعلان
              می‌گیرد (`referTask`).
            */}
            {canManage && referring && (
              <form action={referAction} className="grid gap-2 rounded-md border border-dashed p-3">
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="toUserId" value={referTo.id ?? ''} />
                <span className="text-sm font-medium">{tr("ارجاعِ تسک به شخصِ دیگر")}</span>
                <Combobox
                  options={(options?.assignees ?? []).map((a) => ({ value: a.userId, label: a.label }))}
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

            {canManage && (
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
                  <Pencil className="size-3.5" />
                  {tr("ویرایش تسک")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => { setReferring((v) => !v); setEditing(false); }}
                >
                  <Share2 className="size-3.5" />
                  {tr("ارجاع")}
                </Button>
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
              <form action={saveAction} className="grid gap-3 rounded-md border p-3">
                <input type="hidden" name="taskId" value={task.id} />

                <div className="grid gap-1.5">
                  <Label htmlFor="t-title">{t("عنوان")}</Label>
                  <Input id="t-title" name="title" defaultValue={task.title} required />
                  {saveState.fieldErrors?.title && (
                    <p className="text-xs text-destructive">{t(saveState.fieldErrors.title)}</p>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="t-desc">{t("توضیحات")}</Label>
                  <Textarea id="t-desc" name="description" rows={3} defaultValue={task.description} />
                </div>

                {(options.tasks?.filter((x) => x.id !== task.id).length ?? 0) > 0 && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="t-depends">{t("وابسته به")}</Label>
                    <NativeSelect id="t-depends" name="dependsOn" containerClassName="w-full" defaultValue={task.dependsOn ? String(task.dependsOn) : ''}>
                      <NativeSelectOption value="">—</NativeSelectOption>
                      {options.tasks!.filter((x) => x.id !== task.id).map((x) => (
                        <NativeSelectOption key={x.id} value={x.id}>{x.title}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="t-status">{t("وضعیت")}</Label>
                    <NativeSelect
                      id="t-status"
                      name="statusTagId"
                      containerClassName="w-full"
                      defaultValue={task.statusTagId ? String(task.statusTagId) : ''}
                    >
                      <NativeSelectOption value="">{t("— بدون وضعیت —")}</NativeSelectOption>
                      {options.statuses.map((s) => (
                        <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>

                  {/* جستجوی زنده — همان دلیلِ فرمِ افزودن: فهرستِ بلند. */}
                  <div className="grid gap-1.5">
                    <Label htmlFor="t-assignee">{t("تخصیص به…")}</Label>
                    <Combobox
                      id="t-assignee"
                      name="assignedTo"
                      options={options.assignees.map((a) => ({ value: a.userId, label: a.label }))}
                      value={assignee}
                      onChange={setAssignee}
                      placeholder={t("نامِ عضو را تایپ کنید…")}
                    />
                  </div>

                  {/*
                    ⚠️ نقش‌ها در ویرایش — پیش از این فرمِ ویرایش انتخابگرِ نقش نداشت و
                    سرور هم نمی‌نوشتشان؛ نقشِ تسک بعد از ساخت غیرقابلِ تغییر بود.
                    و وقتی تسک به شخص سپرده شده، نقش کنار می‌رود (همان قاعدهٔ فرمِ افزودن).
                  */}
                  {options.roles.length > 0 && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="t-roles">{t("تخصیص به نقش")}</Label>
                      {assignee.id !== null ? (
                        <div className="flex h-9 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
                          {tr("به شخص سپرده شده — نقش لازم نیست")}
                        </div>
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
                    </div>
                  )}

                  <div className="grid gap-1.5">
                    <Label htmlFor="t-priority">{t("اولویت…")}</Label>
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
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="t-due">{t("ددلاین")}</Label>
                    <DatePicker
                      id="t-due"
                      name="dueDate"
                      defaultValue={task.dueDate ?? ''}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="isPrivate" value="1" defaultChecked={task.isPrivate} />
                  {tr("تسکِ خصوصی (فقط سازنده، مسئول و مدیران)")}
                </label>

                {saveState.error && <p className="text-xs text-destructive">{tr(saveState.error)}</p>}
                <div className="flex justify-end">
                  <SubmitButton label={t("ذخیرهٔ تغییرات")} busy={t('در حالِ ذخیره…')} />
                </div>
              </form>
            )}

            <section className="grid gap-2">
              <h4 className="text-sm font-semibold">{t("گفتگوی تسک")}</h4>
              {data.detail.notes.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("هنوز گفتگویی نیست.")}</p>
              ) : (
                <ul className="grid gap-2">
                  {data.detail.notes.map((n) => (
                    <li key={n.id} className="rounded-md border p-2.5">
                      <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {n.userName ?? '—'} · <span className="num">{when(n.createdAt, tz)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {/* ⚠️ همکارِ فقط‌خواندنی یادداشت نمی‌نویسد (سرور هم رد می‌کند) — فرم را نبیند. */}
              {(data?.detail.canInteract ?? true) && (
              <form action={noteAction} className="grid gap-2">
                <input type="hidden" name="taskId" value={task.id} />
                <Textarea name="body" rows={2} placeholder={t("یادداشت/توضیح بنویسید…")} required />
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
