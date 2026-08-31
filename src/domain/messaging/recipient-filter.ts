/**
 * فیلترِ زندهٔ گیرندگانِ پیام — پورتِ `ktMsgLiveFilter()` (admin-messages.js).
 *
 * انتخابِ دفتر فهرستِ پروژه‌ها را باریک می‌کند، و «دفتر ∩ پروژه» فهرستِ
 * گیرندگان را. سه ریزه‌کاری که بدونشان فیلتر **مانعِ** کار می‌شود، نه کمکش:
 *
 *  ۱. پروژهٔ **بی‌دفتر** همیشه دیده می‌شود — شاید مدیر فقط یادش رفته دفتری
 *     برایش بگذارد؛ پنهان‌کردنش یعنی پروژه‌ای که وجود دارد ناپدید شود.
 *  ۲. **کارفرمای** پروژه زیرِ فیلترِ دفتر هم می‌ماند: کارفرما به پروژه تعلق
 *     دارد نه به دفتر، و حذفش یعنی نتوانی به کارفرمای پروژه‌ات پیام بدهی.
 *  ۳. کسی که **قبلاً انتخاب شده** هرگز حذف نمی‌شود؛ فیلتر فقط منویِ
 *     انتخاب‌شدنی را کوچک می‌کند. وگرنه عوض‌کردنِ دفتر بی‌صدا گیرنده‌ها را
 *     می‌انداخت.
 */

export interface ProjectRef {
  id: number;
  officeId: number | null;
  memberIds: readonly number[];
  clientIds: readonly number[];
}

/** پروژه‌های دیدنی زیرِ انتخابِ دفتر. */
export function visibleProjects<T extends ProjectRef>(
  projects: readonly T[],
  officeId: number | null,
): T[] {
  if (!officeId) return [...projects];
  // ⚠️ پروژهٔ بی‌دفتر می‌ماند (قاعدهٔ ۱).
  return projects.filter((p) => p.officeId === null || p.officeId === officeId);
}

/**
 * آیا انتخابِ فعلیِ پروژه هنوز معتبر است؟ اگر نه، باید صفر شود.
 * ⚠️ بدونِ این، پروژه‌ای که دیگر دیده نمی‌شود همچنان فیلترِ گیرندگان را
 * تعیین می‌کرد — فهرستی خالی بدونِ هیچ توضیحی.
 */
export function keepsProject(
  projects: readonly ProjectRef[],
  projectId: number | null,
  officeId: number | null,
): boolean {
  if (!projectId) return true;
  return visibleProjects(projects, officeId).some((p) => p.id === projectId);
}

/**
 * شناسه‌های مجازِ گیرنده. `null` یعنی «بدونِ فیلتر» — نه «هیچ‌کس».
 * تفاوتشان مهم است: فهرستِ خالی یعنی هیچ گیرنده‌ای، ولی نبودنِ فیلتر یعنی همه.
 */
export function allowedRecipients(input: {
  projects: readonly ProjectRef[];
  officeMembers: Readonly<Record<number, readonly number[]>>;
  officeId: number | null;
  projectId: number | null;
}): Set<number> | null {
  const { officeId, projectId } = input;

  if (projectId) {
    const project = input.projects.find((p) => p.id === projectId);
    if (!project) return new Set();

    let members: readonly number[] = project.memberIds;
    if (officeId) {
      const inOffice = new Set(input.officeMembers[officeId] ?? []);
      members = members.filter((id) => inOffice.has(id));
    }
    // ⚠️ کارفرما بدونِ فیلترِ دفتر اضافه می‌شود (قاعدهٔ ۲).
    return new Set([...members, ...project.clientIds]);
  }

  if (officeId) return new Set(input.officeMembers[officeId] ?? []);

  return null;
}

/**
 * گیرندگانِ **قابلِ انتخاب** — انتخاب‌شده‌ها همیشه می‌مانند (قاعدهٔ ۳).
 */
export function pickableRecipients<T extends { id: number }>(
  recipients: readonly T[],
  allowed: Set<number> | null,
  picked: ReadonlySet<number>,
): T[] {
  if (!allowed) return [...recipients];
  return recipients.filter((r) => allowed.has(r.id) || picked.has(r.id));
}
