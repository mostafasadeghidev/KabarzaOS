'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { getAccessForm, setUserAccess } from '@/server/people/service';
import { setAvatar } from '@/server/files/service';
import { FileRejected, rejectMessage } from '@/domain/files/upload';
import { ForbiddenError } from '@/domain/access/guard';

/**
 * اکشن‌های دسترسیِ همکارِ ادمین.
 * ⚠️ هیچ گاردی اینجا نیست — همه در سرویس‌اند (R-ARCH-01). اینجا فقط خطا را به
 * پیامِ فارسی تبدیل می‌کنیم.
 */

function message(error: unknown): string {
  if (error instanceof ForbiddenError) {
    if (error.message === 'rbac.owner_only') return 'فقط مدیرِ کل می‌تواند دسترسی‌ها را تغییر دهد.';
    if (error.message === 'rbac.not_staff') return 'این کاربر «همکارِ ادمین» نیست و دسترسیِ پیکربندی‌شدنی ندارد.';
  }
  return 'انجام نشد.';
}

export async function loadAccessAction(userId: number) {
  try {
    return { data: await getAccessForm(await requireActor(), userId) };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function saveAccessAction(
  userId: number,
  levels: Record<string, string>,
  visibleTabs: string[],
) {
  try {
    await setUserAccess(await requireActor(), userId, { levels, visibleTabs });
    // هر دو خانهٔ این قابلیت: خلاصهٔ ردیف در تنظیمات و منوی کارتِ افراد.
    revalidatePath('/settings');
    revalidatePath('/members');
    return { message: 'دسترسی‌ها ذخیره شد.' };
  } catch (error) {
    return { error: message(error) };
  }
}

/**
 * آواتارِ کاربر.
 * ⚠️ گاردش در سرویس است: آدم آواتارِ خودش را می‌تواند عوض کند، آواتارِ
 * دیگری فقط با مدیریتِ اعضا.
 */
export async function setAvatarAction(userId: number, formData: FormData) {
  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) return { error: 'تصویری انتخاب نشده است.' };

  try {
    await setAvatar(await requireActor(), userId, {
      name: file.name,
      mime: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  } catch (error) {
    if (error instanceof FileRejected) return { error: rejectMessage(error.reason) };
    return { error: message(error) };
  }

  revalidatePath('/members');
  revalidatePath('/clients');
  return { message: 'تصویر ثبت شد.' };
}
