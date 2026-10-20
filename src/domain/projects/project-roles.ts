/**
 * نقشِ یک نفر **روی یک پروژه** (۲.۴۲.۰).
 *
 * ⚠️ «مدیر پروژه» نقشِ پروژه است، نه شغلِ آدم: دولوپر همیشه دولوپر است و روی
 * پروژه‌ای خاص مدیرِ همان پروژه می‌شود. پس هنگامِ افزودن به پروژه، «مدیر پروژه»
 * برای **هر کسی** قابلِ انتخاب است — بی‌آنکه روی پروفایلش باشد. پیش از این
 * فقط کسی که این نقش روی پروفایلش بود می‌توانست بگیردش، و برداشتنش از پروفایل
 * عضویتِ «مدیر پروژه» ِ پروژه‌ها را دست نمی‌زد (کاربرِ Test روی سرور).
 *
 * نقش‌های دیگر مثلِ قبل به نقش‌های خودِ آن نفر محدودند؛ نفرِ بی‌نقش همه را می‌بیند.
 */

export interface RoleChoiceInput {
  /** همهٔ نقش‌های عضو (تگِ `member_role`) به ترتیبِ تنظیمات. */
  allRoleIds: readonly number[];
  /** نقش‌های «مدیر پروژه» (`grants_cap = pm`). */
  pmRoleIds: readonly number[];
  /** نقش‌های روی پروفایلِ همین نفر. */
  ownRoleIds: readonly number[];
  /** بیننده می‌تواند «مدیر پروژه» تعیین کند (`canAssignProjectManager`). */
  canAssignPm: boolean;
  /** نقشِ فعلیِ ردیف — همیشه در فهرست می‌ماند تا ویرایش بی‌صدا پاکش نکند. */
  currentRoleId?: number | null;
}

/** نقش‌های کاری (غیرِ مدیرِ پروژه) ِ خودِ نفر. */
export function ownWorkRoles(ownRoleIds: readonly number[], pmRoleIds: readonly number[]): number[] {
  return ownRoleIds.filter((id) => !pmRoleIds.includes(id));
}

/** گزینه‌های نقشِ یک ردیف، به ترتیبِ `allRoleIds`. */
export function roleChoices(input: RoleChoiceInput): number[] {
  const own = ownWorkRoles(input.ownRoleIds, input.pmRoleIds);
  return input.allRoleIds.filter((id) => {
    if (id === input.currentRoleId) return true;
    if (input.pmRoleIds.includes(id)) return input.canAssignPm;
    // نفرِ بی‌نقش همهٔ نقش‌های کاری را می‌بیند (رفتارِ قبلی)؛ بقیه فقط مالِ خودشان را.
    return own.length === 0 || own.includes(id);
  });
}

/**
 * «نقشِ خودش» فقط وقتی معنا دارد که یک نقشِ کاری باشد. کسی که چند نقش دارد
 * باید صریح انتخاب شود — وگرنه بی‌آنکه کسی بداند با اولین نقش (به ترتیبِ
 * تنظیمات) اضافه می‌شد.
 */
export function needsExplicitRole(ownRoleIds: readonly number[], pmRoleIds: readonly number[]): boolean {
  return ownWorkRoles(ownRoleIds, pmRoleIds).length > 1;
}

/**
 * آیا این تغییرِ فهرستِ اعضا «مدیر پروژه» را جابه‌جا می‌کند؟ — افزودن، برداشتن
 * یا عوض‌کردنِ نقشِ مدیرِ پروژه. فقط چنین تغییری اختیارِ ویژه می‌خواهد.
 */
export function changesProjectManagers(
  existing: ReadonlyArray<{ userId: number; roleTagId: number | null }>,
  desired: ReadonlyArray<{ userId: number; roleTagId: number | null }>,
  pmRoleIds: readonly number[],
): boolean {
  const key = (rows: ReadonlyArray<{ userId: number; roleTagId: number | null }>) =>
    [...new Set(rows.filter((r) => r.roleTagId !== null && pmRoleIds.includes(r.roleTagId))
      .map((r) => `${r.userId}:${r.roleTagId}`))].sort().join(',');
  return key(existing) !== key(desired);
}
