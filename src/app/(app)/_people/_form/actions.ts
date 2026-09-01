'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  attachRole, createPerson, PasswordPolicyError, PersonNotFoundError, removePerson,
  setMemberState, setPersonPassword, updatePerson,
} from '@/server/people/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { RemoveOutcome } from '@/domain/people/offboarding';
import type { Role } from '@/domain/access/permissions';
import { isValidUsername } from '@/domain/auth/login';

/**
 * اقدام‌های صفحهٔ افراد.و اقدام‌های ردیفِ نسخهٔ قبلی.
 *
 * ⚠️ نقش **پارامتر** است، نه هاردکد: «اعضا» و «کارفرمایان» در نسخهٔ قبلی هم یک
 * صفحهٔ پایه‌اند با نقشِ متفاوت (R-PEOPLE-04).
 */

/** نقش از فرم می‌آید ولی به فهرستِ سفید محدود است — ورودی هرگز نقشِ دلخواه نمی‌سازد. */
const SECTION_ROLES = ['member', 'client'] as const;
type SectionRole = (typeof SECTION_ROLES)[number];

function sectionRole(raw: FormDataEntryValue | null): SectionRole {
  const value = String(raw ?? '');
  return (SECTION_ROLES as readonly string[]).includes(value) ? (value as SectionRole) : 'member';
}

/** رشته‌های فرم ← شناسه‌های مثبت. «۰» و مقدارِ نامعتبر دور ریخته می‌شوند. */
function numbers(list: string[]): number[] {
  return list.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
}

const idList = z.array(z.string()).transform(numbers);

const personSchema = z.object({
  name: z.string().trim().min(1, 'نام الزامی است').max(120, 'نام بیش از حد بلند است'),
  email: z.string().trim().email('ایمیل معتبر نیست'),
  phone: z.string().trim().max(40, 'شمارهٔ تلفن بیش از حد بلند است').default(''),
  /**
   * ⚠️ اختیاری و **فقط هنگامِ ساخت**: خالی یعنی کاربر ساخته می‌شود ولی
   * هنوز نمی‌تواند وارد شود؛ مدیر بعداً از همان صفحه رمز می‌گذارد. هرگز
   * رمزِ پیش‌فرضِ حدس‌زدنی نمی‌سازیم.
   */
  password: z.string().min(8, 'رمز دستِ‌کم ۸ نویسه باشد').optional()
    .or(z.literal('').transform(() => undefined)),
  /**
   * ⚠️ اختیاری: خالی یعنی فقط با ایمیل وارد می‌شود. قاعده‌اش همان قاعدهٔ
   * ویزاردِ نصب است، تا دو تعریفِ متفاوت از «نامِ کاربریِ معتبر» نداشته
   * باشیم.
   */
  username: z.string().trim().toLowerCase()
    .refine((v) => v === '' || isValidUsername(v),
      'نامِ کاربری باید ۳ تا ۳۲ نویسهٔ لاتین، رقم، نقطه، خط تیره یا زیرخط باشد')
    .default(''),
  tagIds: idList,
  officeIds: idList,
  managedOfficeIds: idList,
  /**
   * ⚠️ گرنتِ دیدِ خصوصی. اینجا فقط خوانده می‌شود؛ **گاردِ واقعی در سرویس
   * است** (R-ARCH-01)، چون فرم را می‌شود دور زد.
   */
  privateAccess: z.boolean().default(false),
});

export interface PersonFormState {
  error?: string;
  fieldErrors?: Partial<Record<'name' | 'email' | 'phone' | 'password' | 'username', string>>;
  values?: Record<string, string>;
  ok?: boolean;
}

function parse(formData: FormData) {
  const values: Record<string, string> = {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    username: String(formData.get('username') ?? ''),
  };

  const parsed = personSchema.safeParse({
    name: values.name,
    email: values.email,
    phone: values.phone,
    username: values.username,
    // ⚠️ عمداً در `values` نیست: مقدارِ بازگشتی به فرم برمی‌گردد و رمز
    // نباید در HTML ِ پاسخ بنشیند.
    password: String(formData.get('password') ?? ''),
    tagIds: formData.getAll('tagIds').map(String),
    officeIds: formData.getAll('officeIds').map(String),
    managedOfficeIds: formData.getAll('managedOfficeIds').map(String),
    privateAccess: formData.get('privateAccess') !== null,
  });

  return { parsed, values };
}

function fieldErrorsOf(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const out: PersonFormState['fieldErrors'] = {};
  for (const issue of issues) {
    const key = issue.path[0] as 'name' | 'email' | 'phone' | 'username';
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function savePersonAction(
  _prev: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> {
  const rawId = Number(formData.get('userId'));
  const userId = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
  const role: Role = sectionRole(formData.get('role'));

  /**
   * انتخابگرِ «کاربرِ موجود» — پورتِ `existing_user_id` ِ نسخهٔ قبلی.
   *
   * ⚠️ **قبل از** اعتبارسنجیِ فرم بررسی می‌شود: کاربرِ موجود از قبل نام و
   * ایمیلِ معتبر دارد و اجبار به پر کردنِ دوبارهٔ آن‌ها بی‌معناست. اینجا
   * فقط نقش (و اگر داده شده، تلفن/تگ/دفتر) اعمال می‌شود.
   */
  const rawExisting = Number(formData.get('existingUserId'));
  const existingId = Number.isInteger(rawExisting) && rawExisting > 0 ? rawExisting : null;

  if (!userId && existingId) {
    try {
      const actor = await requireActor();
      await attachRole(actor, existingId, role, {
        phone: String(formData.get('phone') ?? '').trim(),
        tagIds: numbers(formData.getAll('tagIds').map(String)),
        officeIds: numbers(formData.getAll('officeIds').map(String)),
        managedOfficeIds: numbers(formData.getAll('managedOfficeIds').map(String)),
      });
    } catch (error) {
      if (error instanceof ForbiddenError) return { error: 'اجازهٔ تغییرِ اعضا ندارید.' };
      if (error instanceof PersonNotFoundError) return { error: 'کاربر یافت نشد.' };
      return { error: 'ذخیره نشد.' };
    }
    revalidatePath(pathOf(role));
    return { ok: true };
  }

  const { parsed, values } = parse(formData);
  if (!parsed.success) {
    return { error: 'لطفاً خطاهای فرم را برطرف کنید.', fieldErrors: fieldErrorsOf(parsed.error.issues), values };
  }

  try {
    const actor = await requireActor();
    if (userId) await updatePerson(actor, userId, parsed.data);
    else await createPerson(actor, role, parsed.data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return {
        error: error.message === 'email.taken'
          ? 'این ایمیل قبلاً ثبت شده است.'
          : 'اجازهٔ تغییرِ اعضا ندارید.',
        values,
      };
    }
    if (error instanceof PersonNotFoundError) return { error: 'کاربر یافت نشد.', values };
    return { error: 'ذخیره نشد.', values };
  }

  revalidatePath(pathOf(role));
  return { ok: true };
}

/** مسیرِ صفحهٔ هر نقش — برای تازه‌سازیِ همان صفحه. */
function pathOf(role: Role): string {
  return role === 'client' ? '/clients' : '/members';
}

export interface StateActionState {
  error?: string;
  ok?: boolean;
  /** پیامِ سرانجامِ واقعیِ حذف — R-PEOPLE-02. */
  message?: string;
  outcome?: RemoveOutcome;
}

export async function setStateAction(
  userId: number,
  state: string,
  rawRole = 'member',
): Promise<StateActionState> {
  const role = sectionRole(rawRole);
  try {
    const actor = await requireActor();
    await setMemberState(actor, userId, state);
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ تغییرِ دسترسی ندارید.' };
    return { error: 'وضعیتِ دسترسی ثبت نشد.' };
  }
  revalidatePath(pathOf(role));
  return { ok: true, message: 'وضعیت دسترسیِ عضو به‌روزرسانی شد.' };
}

export async function removePersonAction(
  userId: number,
  rawRole = 'member',
): Promise<StateActionState> {
  const role = sectionRole(rawRole);
  try {
    const actor = await requireActor();
    const result = await removePerson(actor, userId, role);
    revalidatePath(pathOf(role));
    return { ok: true, outcome: result.outcome, message: result.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ حذفِ عضو ندارید.' };
    return { error: 'حذف انجام نشد.' };
  }
}

/* ------------------------------------------------------------------ *
 * رمزِ ورود — تعیین توسط مدیر
 * ------------------------------------------------------------------ */

export interface PasswordState {
  error?: string;
  message?: string;
}

const PASSWORD_REASON: Record<string, string> = {
  too_short: 'رمز دستِ‌کم ۸ نویسه باشد.',
  too_common: 'این رمز خیلی پرتکرار است؛ یکی دیگر انتخاب کنید.',
};

/**
 * مدیر برای فردِ دیگر رمز می‌گذارد — پورتِ «تنظیمِ رمز» ِ صفحهٔ کاربرِ
 * سامانهٔ قبلی.
 *
 * ⚠️ رمز در پاسخ برنمی‌گردد و در هیچ لاگی نمی‌نشیند؛ فقط خودِ عمل ممیزی
 * می‌شود تا معلوم باشد چه کسی رمزِ چه کسی را عوض کرده.
 */
export async function setPersonPasswordAction(
  userId: number,
  password: string,
): Promise<PasswordState> {
  try {
    const actor = await requireActor();
    await setPersonPassword(actor, userId, password);
  } catch (error) {
    if (error instanceof PasswordPolicyError) {
      return { error: PASSWORD_REASON[error.reason] ?? 'رمز پذیرفته نشد.' };
    }
    if (error instanceof ForbiddenError) {
      return {
        error: error.message === 'password.use_profile'
          ? 'رمزِ خودتان را از «پروفایلِ من» عوض کنید.'
          : 'اجازهٔ تغییرِ اعضا ندارید.',
      };
    }
    return { error: 'رمز ذخیره نشد.' };
  }

  revalidatePath('/members');
  revalidatePath('/clients');
  return { message: 'رمزِ ورود تعیین شد.' };
}
