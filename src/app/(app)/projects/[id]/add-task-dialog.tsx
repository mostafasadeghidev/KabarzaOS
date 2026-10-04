'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createTaskAction, type TaskFormState } from '../_form/task-actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Combobox, MultiSelect as SearchableMultiSelect } from '@/components/ui/combobox';
import { useActionToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { defaultTaskStatusId } from '@/domain/projects/defaults';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { DatePicker } from '@/components/ui/date-picker';
import { MediaPicker } from '@/components/media/media-picker';

/** گزینه‌های فرمِ تسک — از سرور می‌آیند (همان `getTaskFormOptions`). */
export interface TaskFormOptions {
  /**
   * نقش‌های این پروژه. برای کارفرما **تنها** راهِ تخصیص است؛ برای بقیه
   * جایگزینِ «به هرکس که این نقش را دارد».
   */
  roles: Array<{ id: number; name: string }>;
  /** خالی یعنی بیننده حق ندارد به **شخص** تخصیص دهد (کارفرمای خالص). */
  assignees: Array<{ userId: number; label: string }>;
  /** `group` برای پیش‌فرضِ «شروع نشده» لازم است. */
  statuses: Array<{ id: number; name: string; group?: string | null }>;
  priorities: Array<{ id: number; name: string }>;
  /** تسک‌های همین پروژه — گزینه‌های «وابسته به». */
  tasks?: Array<{ id: number; title: string }>;
}


function SubmitButton() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <><Spinner />{tr('در حالِ ثبت…')}</> : tr('افزودن تسک')}
    </Button>
  );
}

/** افزودنِ تسک — همان ستون‌های ردیفِ تسکِ نسخهٔ قبلی: عنوان · نقش/مسئول · ددلاین · اولویت. */
export function AddTaskDialog({
  projectId,
  currentUserId,
  options,
  canManage,
}: {
  projectId: number;
  /** پورتِ افزونه: مسئولِ پیش‌فرض خودِ عضو است (نه در نمای کارفرما). */
  currentUserId?: number;
  options: TaskFormOptions;
  /** فقط مدیر «خصوصی» می‌بیند — سرور هم برای بقیه نادیده‌اش می‌گیرد. */
  canManage: boolean;
}) {
  const tr = useT();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<TaskFormState, FormData>(createTaskAction, {});
  useActionToast(state, { success: 'تسک ثبت شد.' });

  const [assignee, setAssignee] = useState<{ id: number | null; label: string }>({ id: null, label: '' });
  const [dependsOn, setDependsOn] = useState<{ id: number | null; label: string }>({ id: null, label: '' });
  const [roleTagIds, setRoleTagIds] = useState<number[]>([]);

  // ثبتِ موفق → مودال بسته می‌شود، فهرست تازه شده و فرم برای تسکِ بعدی خالی است.
  useEffect(() => {
    if (!state.ok) return;
    setOpen(false);
    setAssignee({ id: null, label: '' });
    setDependsOn({ id: null, label: '' });
    setRoleTagIds([]);
  }, [state]);

  const keep = (name: string) => state.values?.[name] ?? '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* دکمهٔ «افزودن» همه‌جا دکمهٔ اصلی است — اینجا outline بود. */}
      <DialogTrigger asChild>
        <Button size="sm">
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

          <Field>
            <FieldLabel htmlFor="nt-title">{t("عنوان تسک")}</FieldLabel>
            <Input id="nt-title" name="title" defaultValue={keep('title')} required autoFocus />
            {state.fieldErrors?.title && (
              <FieldError>{tr(state.fieldErrors.title)}</FieldError>
            )}
          </Field>

          {/* اسکرین‌شات و فایلِ تسک — با دکمه، چسباندن یا رهاکردن روی توضیحات. */}
          <MediaPicker>
            <Field>
              <FieldLabel htmlFor="nt-desc">{t("توضیحات")}</FieldLabel>
              <Textarea id="nt-desc" name="description" rows={2} defaultValue={keep('description')} />
            </Field>
          </MediaPicker>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="nt-status">{t("وضعیت")}</FieldLabel>
              {/*
                ⚠️ تسکِ تازه پیش‌فرض «شروع نشده» است، نه بی‌وضعیت: سرور هم
                همین را می‌گذارد (`defaultTaskStatusId`) و نشان‌دادنِ
                «بدون وضعیت» در فرم یعنی کاربر چیزی می‌بیند که ذخیره نمی‌شود.
              */}
              <NativeSelect
                id="nt-status" name="statusTagId" containerClassName="w-full"
                defaultValue={keep('statusTagId') || String(defaultTaskStatusId(options.statuses.map((s) => ({ id: s.id, group: s.group ?? null }))) ?? '')}
              >
                <NativeSelectOption value="">{t("— بدون وضعیت —")}</NativeSelectOption>
                {options.statuses.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            {/*
              ⚠️ کارفرمای خالص فهرستِ اشخاص را **خالی** می‌گیرد (سرور نامِ
              اعضا را به او نمی‌دهد). نشان‌دادنِ یک انتخابگرِ خالی فقط
              گیج‌کننده بود؛ به‌جایش انتخابگرِ نقش را می‌بیند.
            */}
            {/*
              ⚠️ جستجوی زنده، نه فهرستِ کشویی: پروژهٔ واقعی ده‌ها عضو و تسک
              دارد و پیمایشِ یک select ِ بلند کارِ ساده را کند می‌کند.
              پیش‌فرض **بی‌مسئول** می‌ماند: تسک را اغلب به یک **نقش** می‌دهند
              («یکی از دولوپرها برش می‌دارد»).
            */}
            {options.assignees.length > 0 && (
              <Field>
                <FieldLabel htmlFor="nt-assignee">{t("تخصیص به…")}</FieldLabel>
                <Combobox
                  id="nt-assignee"
                  name="assignedTo"
                  options={options.assignees.map((a) => ({ value: a.userId, label: a.label }))}
                  value={assignee}
                  onChange={setAssignee}
                  placeholder={t("نامِ عضو را تایپ کنید…")}
                />
              </Field>
            )}

            {options.roles.length > 0 && (
              <Field>
                <FieldLabel htmlFor="nt-roles">{t("تخصیص به نقش")}</FieldLabel>
                {/*
                  ⚠️ وقتی تسک به **شخص** سپرده شده، نقش معنا ندارد: صاحبش
                  معلوم است. فیلد جای خود را به یادداشت می‌دهد تا تسک
                  هم‌زمان «مالِ سارا» و «مالِ هر دولوپری» نباشد.
                */}
                {assignee.id !== null ? (
                  <div className="flex h-9 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
                    {tr("به شخص سپرده شده — نقش لازم نیست")}
                  </div>
                ) : (
                  <SearchableMultiSelect
                    id="nt-roles"
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
              <FieldLabel htmlFor="nt-priority">{t("اولویت…")}</FieldLabel>
              <NativeSelect id="nt-priority" name="priorityTagId" containerClassName="w-full" defaultValue={keep('priorityTagId')}>
                <NativeSelectOption value="">—</NativeSelectOption>
                {options.priorities.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>{p.name}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="nt-due">{t("ددلاین")}</FieldLabel>
              <DatePicker id="nt-due" name="dueDate" defaultValue={keep('dueDate')} />
              {state.fieldErrors?.dueDate && (
                <FieldError>{tr(state.fieldErrors.dueDate)}</FieldError>
              )}
            </Field>

            {/* پورتِ انتخابگرِ «وابسته به» — تسک‌های همین پروژه. */}
            {(options.tasks?.length ?? 0) > 0 && (
              <Field>
                <FieldLabel htmlFor="nt-depends">{t("وابسته به")}</FieldLabel>
                <Combobox
                  id="nt-depends"
                  name="dependsOn"
                  options={options.tasks!.map((x) => ({ value: x.id, label: x.title }))}
                  value={dependsOn}
                  onChange={setDependsOn}
                  placeholder={t("عنوانِ تسک را تایپ کنید…")}
                />
              </Field>
            )}
          </div>

          {/*
            ⚠️ فقط برای مدیر. سرور هم برای غیرمدیر نادیده‌اش می‌گیرد، ولی
            نشان‌دادنِ تیکی که کاری نمی‌کند بدتر از نبودنش است — و تسکی که
            کارفرما خصوصی کند حتی مدیرِ پروژه هم نمی‌دیدش.
          */}
          {canManage && (
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="isPrivate" value="1" />
                {tr("تسکِ خصوصی (فقط سازنده، مسئول و مدیران)")}
              </label>
              {/* کارِ داخلیِ تیم — کارفرمای پروژه نمی‌بیندش (مگر به خودش سپرده شود). */}
              <label className="flex items-center gap-2 text-sm">
                <input type="hidden" name="clientHiddenField" value="1" />
                <Checkbox name="clientHidden" value="1" />
                {tr("پنهان از کارفرما")}
              </label>
            </div>
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
