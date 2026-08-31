'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActor } from '@/server/auth';
import {
  bootstrapProject, createProject, InvalidParentError, NotFoundError, updateProject,
} from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import { createProjectSchema, type FormState } from './schema';

/** فیلدهای متنی‌ای که در صورتِ خطا باید به فرم برگردند. */
const RAW_FIELDS = [
  'title', 'description', 'regDate', 'deadline', 'statusTagId',
  'price', 'currencyId', 'officeId', 'parentId', 'scope',
] as const;

/** ساختِ پروژه — گاردِ دسترسی در سرویس است، نه اینجا (R-ARCH-01). */
export async function createProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // چک‌باکس‌ها value="1" می‌فرستند (مثلِ نسخهٔ قبلی)؛ ملاک «حاضر بودن» است نه مقدارِ خاص.
  const checked = (name: string) => formData.get(name) !== null;

  const values: Record<string, string> = {};
  for (const name of RAW_FIELDS) values[name] = String(formData.get(name) ?? '');
  for (const name of ['isUnitBased', 'isTender']) values[name] = checked(name) ? '1' : '';

  const parsed = createProjectSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    regDate: formData.get('regDate') ?? '',
    deadline: formData.get('deadline') ?? '',
    statusTagId: formData.get('statusTagId') ?? '',
    price: formData.get('price') ?? '',
    currencyId: formData.get('currencyId') ?? '',
    officeId: formData.get('officeId') ?? '',
    parentId: formData.get('parentId') ?? '',
    isUnitBased: checked('isUnitBased'),
    isTender: checked('isTender'),
    tenderRoles: readTenderRows(formData),
    scope: formData.get('scope') === 'private' ? 'private' : 'company',
  });

  if (!parsed.success) {
    const fieldErrors: FormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof typeof fieldErrors;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: 'لطفاً خطاهای فرم را برطرف کنید.', fieldErrors, values };
  }

  let id: number;
  try {
    const actor = await requireActor();
    id = await createProject(actor, parsed.data);
    // ⚠️ **بعد از** ساخت — همه به شناسهٔ پروژه نیاز دارند. خطای هر بخش
    // داخلِ خودِ سرویس بلعیده می‌شود تا پروژهٔ ساخته‌شده بی‌صاحب نماند.
    await bootstrapProject(actor, id, readBootstrap(formData));
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ ساختِ پروژه ندارید.', values };
    throw error;
  }

  revalidatePath('/projects');
  redirect(`/projects/${id}`);
}

/**
 * ویرایشِ پروژه — همان اعتبارسنجی و همان بازگرداندنِ مقادیر.
 * برخلافِ ساخت، به صفحهٔ دیگری نمی‌پرد؛ همان‌جا پیغامِ موفقیت می‌دهد.
 */
export async function updateProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = Number(formData.get('projectId'));
  if (!Number.isInteger(id) || id <= 0) return { error: 'پروژه معتبر نیست.' };

  const checked = (name: string) => formData.get(name) !== null;

  const values: Record<string, string> = {};
  for (const name of RAW_FIELDS) values[name] = String(formData.get(name) ?? '');
  for (const name of ['isUnitBased', 'isTender']) values[name] = checked(name) ? '1' : '';

  const parsed = createProjectSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    regDate: formData.get('regDate') ?? '',
    deadline: formData.get('deadline') ?? '',
    statusTagId: formData.get('statusTagId') ?? '',
    price: formData.get('price') ?? '',
    currencyId: formData.get('currencyId') ?? '',
    officeId: formData.get('officeId') ?? '',
    parentId: formData.get('parentId') ?? '',
    isUnitBased: checked('isUnitBased'),
    isTender: checked('isTender'),
    tenderRoles: readTenderRows(formData),
    scope: formData.get('scope') === 'private' ? 'private' : 'company',
  });

  if (!parsed.success) {
    const fieldErrors: FormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof typeof fieldErrors;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: 'لطفاً خطاهای فرم را برطرف کنید.', fieldErrors, values };
  }

  try {
    const actor = await requireActor();
    await updateProject(actor, id, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ ویرایشِ پروژه ندارید.', values };
    if (error instanceof InvalidParentError) {
      return {
        error: 'والدِ انتخاب‌شده معتبر نیست.',
        fieldErrors: { parentId: 'زیرپروژه یک سطح است؛ پروژه‌ای که خودش زیرپروژه دارد نمی‌تواند فرزند شود.' },
        values,
      };
    }
    if (error instanceof NotFoundError) return { error: 'پروژه پیدا نشد.', values };
    throw error;
  }

  revalidatePath(`/projects/${id}`);
  revalidatePath('/projects');
  return { savedId: id };
}

/**
 * ردیف‌های جدولِ نقش/سقفِ مناقصه.
 * ⚠️ دو آرایهٔ هم‌طول‌اند؛ ردیفِ بدونِ نقش نادیده گرفته می‌شود (قاعده در
 * `planTenderRoles`).
 */
function readTenderRows(formData: FormData) {
  const roles = formData.getAll('tenderRole').map(String);
  const caps = formData.getAll('tenderCap').map(String);
  return roles.map((roleTagId, i) => ({
    roleTagId: Number(roleTagId),
    cap: caps[i] ?? '',
  }));
}

/* ------------------------------------------------------------------ *
 * بخش‌های اولیهٔ فرمِ ساخت
 * ------------------------------------------------------------------ */

/** عددِ مثبت یا null — «۰» و رشتهٔ خالی یعنی انتخاب‌نشده. */
function id(value: FormDataEntryValue | undefined): number | null {
  const n = Number(String(value ?? ''));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** مبلغِ فرم ← رشتهٔ decimal (G2). ورودیِ نامعتبر صفر می‌شود، نه NaN. */
function money(value: FormDataEntryValue | undefined): string {
  const raw = String(value ?? '').trim();
  return /^\d+(\.\d{1,4})?$/.test(raw) ? raw : '0';
}

/**
 * خواندنِ اعضا، کارفرمایان، تسک‌های اولیه، QA و لینک‌ها از همان فرم.
 *
 * ⚠️ فیلدهای هر بخش **آرایه‌های موازی** هستند و به ترتیبِ ردیف خوانده
 * می‌شوند؛ برای همین فرم حتی مقدارِ خالی را هم می‌فرستد. ردیفی که شناسهٔ
 * فرد یا عنوان ندارد اینجا حذف می‌شود، نه اینکه ردیفِ ناقص به سرویس برود.
 */
function readBootstrap(formData: FormData) {
  const users = formData.getAll('memberUser');
  const roles = formData.getAll('memberRole');
  const agreed = formData.getAll('memberAgreed');
  const rates = formData.getAll('memberUnitRate');
  const currencies = formData.getAll('memberCurrency');

  const members = users
    .map((u, i) => ({
      userId: id(u),
      roleTagId: id(roles[i]),
      agreedAmount: money(agreed[i]),
      unitRate: money(rates[i]),
      currencyId: id(currencies[i]),
    }))
    .filter((m): m is typeof m & { userId: number } => m.userId !== null);

  const clientIds = formData.getAll('clientId')
    .map((c) => id(c))
    .filter((c): c is number => c !== null);

  const titles = formData.getAll('taskTitle');
  const taskRoles = formData.getAll('taskRoles');
  const dues = formData.getAll('taskDue');
  const priorities = formData.getAll('taskPriority');

  const tasks = titles
    .map((t, i) => {
      // توکنِ «client» در همان رشتهٔ نقش‌هاست — پیش از تبدیل به عدد جدا شود،
      // وگرنه intval آن را صفر می‌کند و بی‌صدا گم می‌شود.
      const tokens = String(taskRoles[i] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      const due = String(dues[i] ?? '').trim();
      return {
        title: String(t ?? '').trim(),
        roleTagIds: tokens.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0),
        toClient: tokens.includes('client'),
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
        priorityTagId: id(priorities[i]),
      };
    })
    .filter((t) => t.title !== '');

  const qaAudiences: Array<number | 'client'> = formData.getAll('qaRole')
    .map((r) => id(r))
    .filter((r): r is number => r !== null);
  if (formData.get('qaClient') !== null) qaAudiences.push('client');

  const urls = formData.getAll('linkUrl');
  const labels = formData.getAll('linkLabel');
  const links = urls
    .map((u, i) => ({ url: String(u ?? '').trim(), label: String(labels[i] ?? '').trim() }))
    .filter((l) => l.url !== '');

  return { members, clientIds, tasks, qaAudiences, links };
}
