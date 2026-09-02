'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  addTaskNote, createTask, deleteTask, getTaskDetail, getTaskFormOptions, updateTask,
} from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import { FrozenProjectError } from '@/server/projects/authority';

/**
 * اقدام‌های تسک (op = load/save/add/delete/note).
 * گاردها همه در سرویس‌اند (R-ARCH-01).
 */

const optionalId = z.string().trim().transform((v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
});

const day = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'تاریخ معتبر نیست')
  .transform((v) => (v === '' ? null : v));

const taskSchema = z.object({
  title: z.string().trim().min(1, 'عنوانِ تسک الزامی است').max(200, 'عنوان بیش از حد بلند است'),
  description: z.string().trim().max(5000).default(''),
  statusTagId: optionalId,
  priorityTagId: optionalId,
  assignedTo: optionalId,
  dueDate: day,
  dependsOn: optionalId,
  isPrivate: z.boolean().default(false),
  /**
   * ⚠️ نقش‌ها تا امروز اصلاً خوانده نمی‌شدند — Zod دورشان می‌ریخت و
   * `createTask` هیچ ردیفِ `task_roles` نمی‌ساخت. برای کارفرما که فقط
   * می‌تواند به نقش بدهد، یعنی تسکی بی‌مسئول و بی‌نقش.
   */
  roleTagIds: z.array(z.number().int().positive()).default([]),
});

export interface TaskFormState {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof taskSchema>, string>>;
  values?: Record<string, string>;
  ok?: boolean;
}

const RAW_FIELDS = ['title', 'description', 'statusTagId', 'priorityTagId', 'assignedTo', 'dueDate', 'dependsOn'] as const;

function parse(formData: FormData) {
  const checked = (name: string) => formData.get(name) !== null;
  const values: Record<string, string> = {};
  for (const name of RAW_FIELDS) values[name] = String(formData.get(name) ?? '');
  values.isPrivate = checked('isPrivate') ? '1' : '';

  const parsed = taskSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    statusTagId: formData.get('statusTagId') ?? '',
    priorityTagId: formData.get('priorityTagId') ?? '',
    assignedTo: formData.get('assignedTo') ?? '',
    dueDate: formData.get('dueDate') ?? '',
    dependsOn: formData.get('dependsOn') ?? '',
    isPrivate: checked('isPrivate'),
    roleTagIds: formData.getAll('roleTagIds')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0),
  });

  return { parsed, values };
}

function fieldErrorsOf(issues: z.ZodIssue[]): TaskFormState['fieldErrors'] {
  const out: TaskFormState['fieldErrors'] = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof NonNullable<TaskFormState['fieldErrors']>;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function createTaskAction(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const projectId = Number(formData.get('projectId'));
  if (!Number.isInteger(projectId) || projectId <= 0) return { error: 'پروژه معتبر نیست.' };

  const { parsed, values } = parse(formData);
  if (!parsed.success) {
    return { error: 'لطفاً خطاهای فرم را برطرف کنید.', fieldErrors: fieldErrorsOf(parsed.error.issues), values };
  }

  try {
    const actor = await requireActor();
    await createTask(actor, projectId, parsed.data);
  } catch (error) {
    // ⚠️ انجماد پیامِ خودش را دارد؛ پیش از این زیرِ «ثبت نشد» گم می‌شد.
    if (error instanceof FrozenProjectError) {
      return { error: 'این پروژه بایگانی/بسته است و تغییر نمی‌پذیرد.', values };
    }
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ افزودنِ تسک ندارید.', values };
    return { error: 'تسک ثبت نشد.', values };
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
  return { ok: true };
}

export async function updateTaskAction(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const taskId = Number(formData.get('taskId'));
  if (!Number.isInteger(taskId) || taskId <= 0) return { error: 'تسک معتبر نیست.' };

  const { parsed, values } = parse(formData);
  if (!parsed.success) {
    return { error: 'لطفاً خطاهای فرم را برطرف کنید.', fieldErrors: fieldErrorsOf(parsed.error.issues), values };
  }

  try {
    const actor = await requireActor();
    const projectId = await updateTask(actor, taskId, parsed.data);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/projects');
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ ویرایشِ تسک ندارید.', values };
    return { error: 'تغییرات ذخیره نشد.', values };
  }
  return { ok: true };
}

export async function deleteTaskAction(taskId: number): Promise<TaskFormState> {
  try {
    const actor = await requireActor();
    const projectId = await deleteTask(actor, taskId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/projects');
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ حذفِ تسک ندارید.' };
    return { error: 'تسک حذف نشد.' };
  }
  return { ok: true };
}

export async function addTaskNoteAction(_prev: TaskFormState, formData: FormData): Promise<TaskFormState> {
  const taskId = Number(formData.get('taskId'));
  const body = String(formData.get('body') ?? '');
  if (!Number.isInteger(taskId) || taskId <= 0) return { error: 'تسک معتبر نیست.' };
  if (body.trim() === '') return { error: 'متنِ یادداشت خالی است.' };

  try {
    const actor = await requireActor();
    const projectId = await addTaskNote(actor, taskId, body);
    revalidatePath(`/projects/${projectId}`);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ ثبتِ یادداشت ندارید.' };
    return { error: 'یادداشت ثبت نشد.' };
  }
  return { ok: true };
}

/**
 * بارگذاریِ جزئیاتِ تسک برای مودال — معادلِ `op=load`.
 * ⚠️ `load` خواندنی است، پس کاربرِ فقط-خواندنی هم بازش می‌کند؛ گزینه‌های
 * ویرایش فقط وقتی خوانده می‌شوند که واقعاً بتواند ویرایش کند.
 */
export async function loadTaskAction(taskId: number) {
  const actor = await requireActor();
  const detail = await getTaskDetail(actor, taskId);
  const options = detail.canManage
    ? await getTaskFormOptions(actor, detail.task.projectId, detail.task.assignedTo)
    : null;
  return { detail, options };
}
