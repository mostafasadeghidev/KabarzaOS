/**
 * نوعِ دستمزدِ هر عضو در پروژه (۲.۵۱.۰).
 *
 * پیش از این «قراردادی/تعدادی» فقط روی خودِ پروژه بود و برای همهٔ اعضا یکی.
 * حالا هر ردیفِ عضویت `payType` ِ خودش را دارد؛ خالی یعنی «مثلِ پروژه»، پس
 * پروژه‌های قدیمی بی‌هیچ مهاجرتِ داده‌ای همان رفتارِ قبلی را دارند.
 *
 * ⚠️ نوع **برای هر نفر** یکی است، نه برای هر ردیف: کارکرد به نفر ثبت می‌شود
 * (نه به نقش)، پس عضوِ دو-نقشه یا تعدادی است یا قراردادی.
 */

export type PayType = 'fixed' | 'unit';

export const PAY_TYPES: readonly PayType[] = ['fixed', 'unit'];

export function projectPayType(projectIsUnit: boolean): PayType {
  return projectIsUnit ? 'unit' : 'fixed';
}

/** نوعِ مؤثرِ یک ردیف — خالی از پروژه پیروی می‌کند. */
export function effectivePayType(rowPayType: string | null | undefined, projectIsUnit: boolean): PayType {
  return rowPayType === 'fixed' || rowPayType === 'unit' ? rowPayType : projectPayType(projectIsUnit);
}

/**
 * آیا این نفر روی این پروژه تعدادی است؟ — هر ردیفِ تعدادی کافی است.
 * نفرِ بی‌ردیف (مدیری که عضو نیست) نوعِ پروژه را می‌گیرد.
 */
export function isUnitMember(
  rows: ReadonlyArray<{ payType?: string | null }>,
  projectIsUnit: boolean,
): boolean {
  if (rows.length === 0) return projectIsUnit;
  return rows.some((r) => effectivePayType(r.payType, projectIsUnit) === 'unit');
}

/**
 * مقدارِ ذخیره‌شدنی: هم‌نوعِ پروژه → خالی، تا تغییرِ بعدیِ نوعِ پروژه این
 * عضو را هم با خودش ببرد؛ مقدارِ نامعتبر هم خالی.
 */
export function storedPayType(value: string | null | undefined, projectIsUnit: boolean): PayType | null {
  if (value !== 'fixed' && value !== 'unit') return null;
  return value === projectPayType(projectIsUnit) ? null : value;
}

/**
 * یک نوع برای هر نفر: نوعِ اولین ردیفِ همان نفر به ردیف‌های دیگرش هم داده
 * می‌شود — فرم یکی‌شان را عوض کرده باشد و دیگری جا مانده باشد، باز یکی است.
 */
export function unifyPayTypes<T extends { userId: number; payType?: PayType | null }>(rows: T[]): T[] {
  const first = new Map<number, PayType | null>();
  for (const r of rows) if (!first.has(r.userId)) first.set(r.userId, r.payType ?? null);
  return rows.map((r) => ({ ...r, payType: first.get(r.userId) ?? null }));
}
