'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createTaskAction, type TaskFormState } from '../_form/task-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { MultiSelect } from '@/components/ui/multi-select';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';

/** گزینه‌های فرمِ تسک — از سرور می‌آیند (همان `getTaskFormOptions`). */
export interface TaskFormOptions {
  /**
   * نقش‌های این پروژه. برای کارفرما **تنها** راهِ تخصیص است؛ برای بقیه
   * جایگزینِ «به هرکس که این نقش را دارد».
   */
  roles: Array<{ id: number; name: string }>;
  /** خالی یعنی بیننده حق ندارد به **شخص** تخصیص دهد (کارفرمای خالص). */
  assignees: Array<{ userId: number; label: string }>;
  statuses: Array<{ id: number; name: string }>;
  priorities: Array<{ id: number; name: string }>;
  /** تسک‌های همین پروژه — گزینه‌های «وابسته به». */
  tasks?: Array<{ id: number; title: string }>;
}

const cellSelect =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function SubmitButton() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? tr('در حالِ ثبت…') : tr('افزودن تسک')}
    </Button>
  );
}

/** افزودنِ تسک — همان ستون‌های ردیفِ تسکِ نسخهٔ قبلی: عنوان · نقش/مسئول · ددلاین · اولویت. */
export function AddTaskDialog({
  projectId,
  options,
  canManage,
}: {
  projectId: number;
  options: TaskFormOptions;
  /** فقط مدیر «خصوصی» می‌بیند — سرور هم برای بقیه نادیده‌اش می‌گیرد. */
  canManage: boolean;
}) {
  const tr = useT();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<TaskFormState, FormData>(createTaskAction, {});
  useActionToast(state, { success: 'تسک ثبت شد.' });

  // ثبتِ موفق → مودال بسته می‌شود و فهرست تازه‌شده است.
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  const keep = (name: string) => state.values?.[name] ?? '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" />
          {tr("افزودن تسک")}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("افزودن تسک جدید")}</DialogTitle>
          <DialogDescription>{t("تسک به همین پروژه اضافه می‌شود.")}</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="projectId" value={projectId} />

          <div className="grid gap-1.5">
            <Label htmlFor="nt-title">{t("عنوان تسک")}</Label>
            <Input id="nt-title" name="title" defaultValue={keep('title')} required autoFocus />
            {state.fieldErrors?.title && (
              <p className="text-xs text-destructive">{tr(state.fieldErrors.title)}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="nt-desc">{t("توضیحات")}</Label>
            <Textarea id="nt-desc" name="description" rows={2} defaultValue={keep('description')} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nt-status">{t("وضعیت")}</Label>
              <select id="nt-status" name="statusTagId" className={cellSelect} defaultValue={keep('statusTagId')}>
                <option value="">{t("— بدون وضعیت —")}</option>
                {options.statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/*
              ⚠️ کارفرمای خالص فهرستِ اشخاص را **خالی** می‌گیرد (سرور نامِ
              اعضا را به او نمی‌دهد). نشان‌دادنِ یک انتخابگرِ خالی فقط
              گیج‌کننده بود؛ به‌جایش انتخابگرِ نقش را می‌بیند.
            */}
            {options.assignees.length > 0 && (
              <div className="grid gap-1.5">
                <Label htmlFor="nt-assignee">{t("تخصیص به…")}</Label>
                <select id="nt-assignee" name="assignedTo" className={cellSelect} defaultValue={keep('assignedTo')}>
                  <option value="">{t("— هیچ‌کدام —")}</option>
                  {options.assignees.map((a) => (
                    <option key={a.userId} value={a.userId}>{a.label}</option>
                  ))}
                </select>
              </div>
            )}

            {options.roles.length > 0 && (
              <div className="grid gap-1.5">
                <Label>{t("تخصیص به نقش")}</Label>
                <MultiSelect
                  name="roleTagIds"
                  options={options.roles.map((r) => ({ id: r.id, label: r.name }))}
                  placeholder={t("نقش‌ها…")}
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="nt-priority">{t("اولویت…")}</Label>
              <select id="nt-priority" name="priorityTagId" className={cellSelect} defaultValue={keep('priorityTagId')}>
                <option value="">—</option>
                {options.priorities.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nt-due">{t("ددلاین")}</Label>
              <Input id="nt-due" type="date" name="dueDate" className="num" defaultValue={keep('dueDate')} />
              {state.fieldErrors?.dueDate && (
                <p className="text-xs text-destructive">{tr(state.fieldErrors.dueDate)}</p>
              )}
            </div>

            {/* پورتِ انتخابگرِ «وابسته به» — تسک‌های همین پروژه. */}
            {(options.tasks?.length ?? 0) > 0 && (
              <div className="grid gap-1.5">
                <Label htmlFor="nt-depends">{t("وابسته به")}</Label>
                <select id="nt-depends" name="dependsOn" className={cellSelect} defaultValue={keep('dependsOn')}>
                  <option value="">—</option>
                  {options.tasks!.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                </select>
              </div>
            )}
          </div>

          {/*
            ⚠️ فقط برای مدیر. سرور هم برای غیرمدیر نادیده‌اش می‌گیرد، ولی
            نشان‌دادنِ تیکی که کاری نمی‌کند بدتر از نبودنش است — و تسکی که
            کارفرما خصوصی کند حتی مدیرِ پروژه هم نمی‌دیدش.
          */}
          {canManage && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isPrivate" value="1" />
              {tr("تسکِ خصوصی (فقط سازنده، مسئول و مدیران)")}
            </label>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("انصراف")}</Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
