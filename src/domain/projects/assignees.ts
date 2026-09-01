/**
 * فهرستِ «تخصیص به…» برای یک تسک — `task_edit_form_admin()`.
 *
 * منبعِ گزینه‌ها دو تاست: اعضای پروژه و **کارفرمایانِ** پروژه (تسک می‌تواند
 * مالِ کارفرما هم باشد، چون تخصیصِ شخصی است نه نقشی).
 */

import { createTranslator, type Translator } from '@/i18n/translate';

/** بدونِ مترجم همان فارسیِ مبدأ برمی‌گردد — کلید خودِ متنِ فارسی است. */
const SOURCE: Translator = createTranslator({});

export interface AssigneeCandidate {
  userId: number;
  name: string;
  /** نقشِ عضو روی همین پروژه؛ کارفرما نقش ندارد. */
  roleName?: string | null;
  isClient?: boolean;
}

export interface AssigneeOption {
  userId: number;
  label: string;
}

/**
 * ⚠️ R-PROJ-29 — عضوِ غیرفعال به‌عنوان مسئولِ **جدید** پیشنهاد نمی‌شود، اما اگر
 * همین حالا مسئولِ تسک باشد در فهرست می‌ماند.
 *
 * بدونِ این استثنا، هر ویرایشِ ساده روی تسکِ یک عضوِ سابق او را **بی‌صدا**
 * از مسئولیت برمی‌داشت (چون گزینه‌اش در فهرست نبود، انتخابگر روی «هیچ‌کدام»
 * می‌افتاد و ذخیره همان را می‌نوشت).
 *
 * کاربرِ تکراری (هم عضو هم کارفرما) یک بار می‌آید و برچسبِ عضو برنده است.
 */
export function assigneeOptions(
  members: AssigneeCandidate[],
  clients: AssigneeCandidate[],
  options: { inactiveUserIds?: ReadonlySet<number>; currentAssignee?: number | null } = {},
  t: Translator = SOURCE,
): AssigneeOption[] {
  const inactive = options.inactiveUserIds ?? new Set<number>();
  const current = options.currentAssignee ?? null;

  const out: AssigneeOption[] = [];
  const seen = new Set<number>();

  for (const m of members) {
    if (seen.has(m.userId)) continue;
    if (inactive.has(m.userId) && m.userId !== current) continue;
    seen.add(m.userId);
    out.push({ userId: m.userId, label: m.roleName ? `${m.name} · ${m.roleName}` : m.name });
  }

  for (const c of clients) {
    if (seen.has(c.userId)) continue; // قبلاً به‌عنوانِ عضو آمده است.
    if (inactive.has(c.userId) && c.userId !== current) continue;
    seen.add(c.userId);
    out.push({ userId: c.userId, label: t('{name} · کارفرما', { name: c.name }) });
  }

  return out;
}
