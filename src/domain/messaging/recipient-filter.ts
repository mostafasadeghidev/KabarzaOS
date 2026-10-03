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

/**
 * کلیدِ جستجوی نام — «ي/ك» ِ عربی با «ی/ک»، نیم‌فاصله با فاصله و بزرگی/کوچکی
 * یکی می‌شوند؛ وگرنه نامی که با صفحه‌کلیدِ دیگری ثبت شده هرگز پیدا نمی‌شد.
 */
export function searchKey(text: string): string {
  return text
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌‏‎]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** آیا نام با عبارتِ جستجو جور است؟ عبارتِ خالی یعنی همه. */
export function matchesName(name: string, query: string): boolean {
  const needle = searchKey(query);
  return needle === '' || searchKey(name).includes(needle);
}

/**
 * اعضای تیمِ پروژه برای تیکِ خودکار — زیرِ فیلترِ دفتر، و فقط از میانِ
 * گیرندگانِ ممکن با نقشِ «عضو».
 *
 * ⚠️ کارفرمای پروژه خودکار تیک نمی‌خورد: پیامی که برای تیم نوشته شده نباید
 * بی‌صدا به کارفرما هم برسد. کارفرما در فهرست می‌ماند تا اگر خواستی دستی بزنی.
 */
export function projectTeamIds(input: {
  projects: readonly ProjectRef[];
  officeMembers: Readonly<Record<number, readonly number[]>>;
  recipients: ReadonlyArray<{ id: number; role: string }>;
  officeId: number | null;
  projectId: number | null;
}): number[] {
  if (!input.projectId) return [];
  const project = input.projects.find((p) => p.id === input.projectId);
  if (!project) return [];
  const inOffice = input.officeId ? new Set(input.officeMembers[input.officeId] ?? []) : null;
  const team = new Set(project.memberIds.filter((id) => !inOffice || inOffice.has(id)));
  return input.recipients.filter((r) => r.role !== 'client' && team.has(r.id)).map((r) => r.id);
}

/**
 * عوض‌شدنِ پروژه (یا دفترِ زیرِ آن) — تیک‌های خودکار جابه‌جا می‌شوند.
 *
 * `auto` تیک‌هایی است که انتخابِ پروژه گذاشته و کاربر هنوز دست نزده. با
 * پروژهٔ تازه همان‌ها برداشته و اعضای پروژهٔ تازه تیک می‌خورند؛ ⚠️ تیکِ دستیِ
 * کاربر هرگز نمی‌افتد، وگرنه عوض‌کردنِ پروژه بی‌صدا گیرنده‌ها را پاک می‌کرد.
 */
export function switchAutoPicks(input: {
  picked: ReadonlySet<number>;
  auto: ReadonlySet<number>;
  team: readonly number[];
}): { picked: Set<number>; auto: Set<number> } {
  const manual = new Set([...input.picked].filter((id) => !input.auto.has(id)));
  const auto = new Set(input.team.filter((id) => !manual.has(id)));
  return { picked: new Set([...manual, ...auto]), auto };
}

/**
 * گیرندگانِ یک مخاطبِ آماده — همان قاعدهٔ `resolveAudience` ِ سرور، برای
 * نشان‌دادنِ «این پیام به n نفر می‌رسد» پیش از ارسال. دفتر فقط برای
 * «همهٔ اعضا» معنا دارد — کارفرما به دفتر تعلق ندارد.
 */
export function audienceIds(input: {
  audience: 'members' | 'clients' | 'all';
  officeId: number | null;
  recipients: ReadonlyArray<{ id: number; role: string }>;
  officeMembers: Readonly<Record<number, readonly number[]>>;
}): number[] {
  const inOffice = input.audience === 'members' && input.officeId
    ? new Set(input.officeMembers[input.officeId] ?? [])
    : null;
  return input.recipients
    .filter((r) => {
      if (r.role === 'client') return input.audience !== 'members';
      return input.audience !== 'clients' && (!inOffice || inOffice.has(r.id));
    })
    .map((r) => r.id);
}
