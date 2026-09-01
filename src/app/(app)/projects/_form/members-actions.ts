'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { setMembers, setProjectAccess } from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import { memberRowSchema, type MembersFormState } from './members-schema';

/**
 * ذخیرهٔ اعضا — آرایه‌های موازی، مثلِ نسخهٔ قبلی.
 *
 * ⚠️ هیچ گاردی اینجا نیست (R-ARCH-01): مجوز، scope، ارث‌بریِ نقش، عضوِ غیرفعال
 * و طلبِ باز همه در `setMembers` و لایهٔ دامنه تصمیم گرفته می‌شوند.
 */
export async function setMembersAction(
  _prev: MembersFormState,
  formData: FormData,
): Promise<MembersFormState> {
  const projectId = Number(formData.get('projectId'));
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return { error: 'پروژه معتبر نیست.' };
  }

  const users = formData.getAll('memberUser');
  const roles = formData.getAll('memberRole');
  const amounts = formData.getAll('memberAmount');
  const rates = formData.getAll('memberUnitRate');
  const currencies = formData.getAll('memberCurrency');

  const rowErrors: Record<number, string> = {};
  const rows = [];

  for (let i = 0; i < users.length; i++) {
    const parsed = memberRowSchema.safeParse({
      userId: String(users[i] ?? ''),
      roleTagId: String(roles[i] ?? ''),
      agreedAmount: String(amounts[i] ?? ''),
      unitRate: String(rates[i] ?? ''),
      currencyId: String(currencies[i] ?? ''),
    });

    if (!parsed.success) {
      rowErrors[i] = parsed.error.issues[0]?.message ?? 'ردیف معتبر نیست';
      continue;
    }
    // ردیفِ بدونِ عضو نادیده گرفته می‌شود — ردیفِ خالیِ تازه‌افزوده خطا نیست.
    if (parsed.data.userId === null) continue;

    rows.push({
      userId: parsed.data.userId,
      roleTagId: parsed.data.roleTagId,
      agreedAmount: parsed.data.agreedAmount,
      unitRate: parsed.data.unitRate,
      currencyId: parsed.data.currencyId,
    });
  }

  if (Object.keys(rowErrors).length > 0) {
    return { error: 'لطفاً خطاهای ردیف‌ها را برطرف کنید.', rowErrors };
  }

  try {
    const actor = await requireActor();
    const diff = await setMembers(actor, projectId, rows);
    revalidatePath(`/projects/${projectId}`);
    return {
      ok: true,
      summary: {
        added: diff.toInsert.length,
        updated: diff.toUpdate.length,
        removed: diff.toDelete.length,
      },
      keptOwed: diff.keptOwedNames,
      keptFormer: diff.keptFormerNames,
    };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ تغییرِ اعضا ندارید.' };
    throw error;
  }
}

/**
 * قطع/وصلِ دسترسیِ یک نفر به این پروژه.
 *
 * ⚠️ جدا از `setMembersAction` است و عمداً: آن یک ویرایشِ گروهی است که
 * ردیف‌های پول‌دار را نگه می‌دارد؛ این یک تصمیمِ صریح دربارهٔ **یک نفر**
 * است و ردیف را دست نمی‌زند.
 */
export async function setProjectAccessAction(
  projectId: number,
  userId: number,
  blocked: boolean,
): Promise<{ error?: string; ok?: boolean }> {
  try {
    const actor = await requireActor();
    await setProjectAccess(actor, projectId, userId, blocked);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'اجازهٔ تغییرِ اعضا ندارید.' };
    return { error: 'انجام نشد.' };
  }
}
