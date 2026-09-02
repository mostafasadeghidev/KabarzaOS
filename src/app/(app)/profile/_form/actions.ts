'use server';

import { FileRejected, rejectMessage } from '@/domain/files/upload';
import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { disconnectTelegram, saveBankInfo, saveCompany, saveNotifyPrefs, saveTimezone, startTelegramLink,
  tryConnectTelegram, changeMyPassword, PasswordError, updateMyProfile, ProfileValidationError,
} from '@/server/people/profile-service';
import { removeAvatar, setAvatar } from '@/server/files/service';
import { ForbiddenError } from '@/domain/access/guard';

export interface ProfileState {
  error?: string;
  message?: string;
  /** پیوندِ اتصالِ تلگرام، وقتی تازه ساخته شده. */
  link?: string;
}

function message(error: unknown): string {
  if (error instanceof ForbiddenError) {
    return error.message === 'company.owner_only'
      ? 'مشخصاتِ شرکت را فقط مدیرِ کل تغییر می‌دهد.'
      : 'دسترسی ندارید.';
  }
  return 'انجام نشد.';
}

export async function saveBankAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  try {
    // عضوِ سابقِ «فقط مالی» هم حساب بانکی‌اش را نگه می‌دارد (پورتِ guard_offboarded_actions).
    await saveBankInfo(await requireActor({ allowOffboarded: true }), {
      account: String(formData.get('account') ?? ''),
      iban: String(formData.get('iban') ?? ''),
      card: String(formData.get('card') ?? ''),
    });
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/profile');
  return { message: 'اطلاعاتِ حساب ذخیره شد.' };
}

export async function saveTimezoneAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  try {
    const saved = await saveTimezone(await requireActor(), String(formData.get('timezone') ?? ''));
    revalidatePath('/profile');
    return {
      message: saved
        ? 'منطقهٔ زمانی ذخیره شد.'
        : 'منطقهٔ زمانی به پیش‌فرضِ سامانه برگشت.',
    };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function connectTelegramAction(): Promise<ProfileState> {
  try {
    const link = await startTelegramLink(await requireActor());
    if (!link) return { error: 'باتِ تلگرام پیکربندی نشده است.' };
    return { link, message: 'بات را باز کنید و Start را بزنید.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function disconnectTelegramAction(): Promise<ProfileState> {
  try {
    await disconnectTelegram(await requireActor());
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/profile');
  return { message: 'اتصال تلگرام قطع شد.' };
}

export async function saveCompanyAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const read = (key: string) => String(formData.get(key) ?? '');
  try {
    await saveCompany(await requireActor(), {
      name: read('name'),
      address: read('address'),
      taxId: read('taxId'),
      email: read('email'),
      phone: read('phone'),
      website: read('website'),
      bank: read('bank'),
      invoiceFooter: read('invoiceFooter'),
    });
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/profile');
  return { message: 'مشخصاتِ شرکت ذخیره شد.' };
}

/**
 * ذخیرهٔ ترجیحاتِ اعلان.
 * ⚠️ چک‌باکسِ تیک‌نخورده در FormData نیست؛ «نبودن» یعنی خاموش.
 */
export async function saveNotifyAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  try {
    const actor = await requireActor();
    await saveNotifyPrefs(actor, {
      email: String(formData.get('notifyEmail') ?? ''),
      emailOn: formData.get('emailOn') !== null,
      // ⚠️ فهرست، **بی‌صداها** را نگه می‌دارد نه روشن‌ها: دستهٔ تازه‌ای که
      // فردا اضافه شود باید پیش‌فرض روشن باشد، نه ساکت.
      muted: formData.getAll('muted').map(String),
      telegramOn: formData.get('telegramOn') !== null,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: error.message === 'email.invalid' ? 'ایمیل معتبر نیست.' : 'ذخیره نشد.' };
    }
    return { error: 'ذخیره نشد.' };
  }
  revalidatePath('/profile');
  return { message: 'ترجیحاتِ اعلان ذخیره شد.' };
}

/**
 * آپلودِ لوگوی شرکت — فقط مالک (گارد در سرویس).
 *
 * ⚠️ فاکتور همه‌جا از همین لوگو استفاده می‌کند، پس مسیرهای فاکتور هم تازه
 * می‌شوند، نه فقط صفحهٔ پروفایل.
 */
export async function setCompanyLogoAction(formData: FormData): Promise<ProfileState> {
  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) return { error: 'تصویری انتخاب نشده است.' };

  try {
    // ⚠️ پویا — `files/service` به `sharp` می‌رسد و آن باندلِ کلاینت را می‌شکند.
    const { setCompanyLogo } = await import('@/server/files/service');
    await setCompanyLogo(await requireActor(), {
      name: file.name,
      mime: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  } catch (error) {
    if (error instanceof FileRejected) return { error: rejectMessage(error.reason) };
    if (error instanceof ForbiddenError) return { error: 'دسترسی ندارید.' };
    return { error: 'ذخیره نشد.' };
  }

  revalidatePath('/profile');
  revalidatePath('/projects', 'layout');
  return { message: 'لوگو ثبت شد.' };
}

/**
 * تکمیلِ اتصالِ تلگرام — پس از آن‌که کاربر به بات پیام داد.
 *
 * ⚠️ کاربر باید **دو** کار کند: باز کردنِ لینک و زدنِ Start، بعد این دکمه.
 * نسخهٔ قبلی هم همین دو مرحله را دارد، چون بدونِ وب‌هوک راهِ دیگری نیست که
 * سرور بفهمد پیام رسیده.
 */
export async function completeTelegramAction(): Promise<ProfileState> {
  const result = await tryConnectTelegram(await requireActor());
  if (result.ok) {
    revalidatePath('/profile');
    return { message: 'تلگرام وصل شد.' };
  }

  switch (result.reason) {
    case 'no_token':
      return { error: 'باتِ تلگرام روی این سامانه پیکربندی نشده است.' };
    case 'taken':
      return { error: 'این تلگرام قبلاً به حسابِ کاربریِ دیگری وصل شده است.' };
    case 'network':
      return { error: 'ارتباط با تلگرام برقرار نشد.' };
    default:
      return { error: 'پیامی از شما پیدا نشد. لینک را باز کنید و Start را بزنید، بعد دوباره امتحان کنید.' };
  }
}

const PASSWORD_MESSAGE: Record<string, string> = {
  wrong_current: 'رمزِ فعلی درست نیست.',
  too_short: 'رمزِ تازه دستِ‌کم ۸ نویسه باشد.',
  too_common: 'این رمز خیلی پرتکرار است؛ یکی دیگر انتخاب کنید.',
};

/**
 * تغییرِ رمزِ خودِ کاربر.
 * ⚠️ رمزِ فعلی لازم است — نشستِ دزدیده‌شده نباید بتواند حساب را قفل کند.
 */
export async function changePasswordAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const next = String(formData.get('next') ?? '');
  const repeat = String(formData.get('repeat') ?? '');
  if (next !== repeat) return { error: 'دو رمزِ تازه یکی نیستند.' };

  try {
    await changeMyPassword(await requireActor(), {
      current: String(formData.get('current') ?? ''),
      next,
    });
  } catch (error) {
    if (error instanceof PasswordError) {
      return { error: PASSWORD_MESSAGE[error.reason] ?? 'رمز عوض نشد.' };
    }
    return { error: 'رمز عوض نشد.' };
  }

  revalidatePath('/profile');
  return { message: 'رمزِ ورود عوض شد.' };
}

/** نام، ایمیل و تلفنِ خودم. */
export async function saveAccountAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  try {
    await updateMyProfile(await requireActor(), {
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? ''),
    });
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      if (error.code === 'email_taken') return { error: 'این ایمیل قبلاً ثبت شده است.' };
      if (error.code === 'email') return { error: 'ایمیل معتبر نیست.' };
      return { error: 'نام الزامی است.' };
    }
    return { error: message(error) };
  }
  revalidatePath('/', 'layout');
  return { message: 'مشخصات ذخیره شد.' };
}

/** تصویرِ پروفایلِ خودم. */
export async function setMyAvatarAction(formData: FormData): Promise<ProfileState> {
  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) return { error: 'تصویری انتخاب نشده است.' };
  try {
    await setAvatar(await requireActor(), (await requireActor()).id, {
      name: file.name,
      mime: file.type || 'application/octet-stream',
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  } catch (error) {
    if (error instanceof FileRejected) return { error: rejectMessage(error.reason) };
    return { error: message(error) };
  }
  revalidatePath('/', 'layout');
  return { message: 'تصویر ذخیره شد.' };
}

export async function removeMyAvatarAction(): Promise<ProfileState> {
  try {
    const actor = await requireActor();
    await removeAvatar(actor, actor.id);
  } catch (error) {
    return { error: message(error) };
  }
  revalidatePath('/', 'layout');
  return { message: 'تصویر حذف شد.' };
}

/** حذفِ لوگوی شرکت — قرینهٔ `setCompanyLogoAction`. */
export async function removeCompanyLogoAction(): Promise<ProfileState> {
  try {
    const { removeCompanyLogo } = await import('@/server/files/service');
    await removeCompanyLogo(await requireActor());
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'دسترسی ندارید.' };
    return { error: 'حذف نشد.' };
  }
  revalidatePath('/profile');
  revalidatePath('/settings');
  revalidatePath('/projects', 'layout');
  return { message: 'لوگو حذف شد.' };
}
