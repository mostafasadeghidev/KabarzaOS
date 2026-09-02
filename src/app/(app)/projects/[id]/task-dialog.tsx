'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Lock, Pencil, Trash2 } from 'lucide-react';
import {
  addTaskNoteAction, deleteTaskAction, loadTaskAction, updateTaskAction,
  type TaskFormState,
} from '../_form/task-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useActionToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { useConfirm } from '@/components/ui/confirm';
import { ClaimTaskButton } from '@/app/(app)/tasks/inbox-claim';

/**
 * مودالِ تسک — بازسازیِ `task_admin_html()`:
 * چیپِ اولویت و وضعیت ← مسئول ← ددلاین ← «آخرین ویرایش توسط» ← توضیحات ←
 * ویرایش/حذف ← گفتگوی تسک با فرمِ یادداشت.
 */

type Loaded = Awaited<ReturnType<typeof loadTaskAction>>;

const cellSelect =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

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
              {task.priorityName && <Badge variant="outline">{task.priorityName}</Badge>}
              {task.statusName ? (
                <Badge variant={task.isReview ? 'warning' : 'secondary'}>{task.statusName}</Badge>
              ) : (
                <Badge variant="outline">{t("بدون وضعیت")}</Badge>
              )}
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

            {canManage && (
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
                  <Pencil className="size-3.5" />
                  {tr("ویرایش تسک")}
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
                    <select id="t-depends" name="dependsOn" className={cellSelect} defaultValue={task.dependsOn ? String(task.dependsOn) : ''}>
                      <option value="">—</option>
                      {options.tasks!.filter((x) => x.id !== task.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="t-status">{t("وضعیت")}</Label>
                    <select
                      id="t-status"
                      name="statusTagId"
                      className={cellSelect}
                      defaultValue={task.statusTagId ? String(task.statusTagId) : ''}
                    >
                      <option value="">{t("— بدون وضعیت —")}</option>
                      {options.statuses.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="t-assignee">{t("تخصیص به…")}</Label>
                    <select
                      id="t-assignee"
                      name="assignedTo"
                      className={cellSelect}
                      defaultValue={task.assignedTo ? String(task.assignedTo) : ''}
                    >
                      <option value="">{t("— هیچ‌کدام —")}</option>
                      {options.assignees.map((a) => (
                        <option key={a.userId} value={a.userId}>{a.label}</option>
                      ))}
                    </select>
                  </div>

                  {/*
                    ⚠️ نقش‌ها در ویرایش — پیش از این فرمِ ویرایش انتخابگرِ نقش نداشت و
                    سرور هم نمی‌نوشتشان؛ نقشِ تسک بعد از ساخت غیرقابلِ تغییر بود.
                    نقش‌های فعلی از detail.roles پیش‌انتخاب می‌شوند.
                  */}
                  {options.roles.length > 0 && (
                    <div className="grid gap-1.5">
                      <Label>{t("تخصیص به نقش")}</Label>
                      <MultiSelect
                        name="roleTagIds"
                        options={options.roles.map((r) => ({ id: r.id, label: r.name }))}
                        defaultSelected={data.detail.roles.map((r) => r.roleTagId)}
                        placeholder={t("نقش‌ها…")}
                      />
                    </div>
                  )}

                  <div className="grid gap-1.5">
                    <Label htmlFor="t-priority">{t("اولویت…")}</Label>
                    <select
                      id="t-priority"
                      name="priorityTagId"
                      className={cellSelect}
                      defaultValue={task.priorityTagId ? String(task.priorityTagId) : ''}
                    >
                      <option value="">—</option>
                      {options.priorities.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="t-due">{t("ددلاین")}</Label>
                    <Input
                      id="t-due"
                      type="date"
                      name="dueDate"
                      className="num"
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
