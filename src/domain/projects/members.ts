/**
 * اعضای پروژه — قواعدِ docs/rules/PROJECTS-TASKS.md
 *
 * پیچیده‌ترین بخشِ این ماژول: به‌روزرسانیِ diff-محور.
 * نسخهٔ قبلی این را با آزمون‌وخطا به اینجا رساند؛ اینجا از اول درست نوشته می‌شود.
 */

export interface MemberInput {
  userId: number;
  roleTagId: number | null;
  agreedAmount: string;
  unitRate?: string;
  currencyId?: number | null;
}

export interface ExistingMember {
  id: number;
  userId: number;
  roleTagId: number | null;
  agreedAmount: string;
  unitRate?: string;
  currencyId?: number | null;
}

export interface DiffOptions {
  /** کاربرانِ غیرفعال — R-PROJ-11. */
  inactiveUserIds?: ReadonlySet<number>;
  /** نقشِ اصلیِ هر کاربر — R-PROJ-10: نقشِ خالی از پروفایل ارث می‌برد. */
  primaryRoleOf?: ReadonlyMap<number, number | null>;
  /** کاربرانی که روی این پروژه هنوز طلب دارند — R-PROJ-23. */
  owedUserIds?: ReadonlySet<number>;
}

export interface MemberDiff {
  /** ردیف‌های تازه — فقط این‌ها اعلان می‌گیرند. */
  toInsert: MemberInput[];
  /** ردیف‌هایی که مبلغ یا نرخشان عوض شده. */
  toUpdate: Array<{ id: number; input: MemberInput }>;
  /** ردیف‌هایی که از فهرست حذف شده‌اند. */
  toDelete: number[];
  /**
   * کاربرانی که از فهرست برداشته شدند ولی به‌خاطرِ طلبِ تسویه‌نشده ماندند
   * (R-PROJ-23). فراخوان باید نامشان را به کاربر بگوید — وگرنه حذف بی‌صدا
   * شکست می‌خورد و به نظر می‌رسد دکمه کار نمی‌کند.
   */
  keptOwed: number[];
  /** همان، ولی به‌خاطرِ عضوِ سابق بودن (R-PROJ-08 §۲). */
  keptFormer: number[];
  /** کاربرانی که **تازه** روی پروژه آمده‌اند (برای اعلان). */
  newlyAdded: number[];
}

const key = (userId: number, roleTagId: number | null) => `${userId}:${roleTagId ?? 0}`;

/**
 * ⚠️ مقایسهٔ مبلغ باید **عددی** باشد، نه رشته‌ای.
 * دیتابیس numeric(20,4) است و «600» را «600.0000» برمی‌گرداند. مقایسهٔ رشته‌ای
 * آن‌ها را متفاوت می‌بیند و هر ذخیره یک UPDATEِ بیهوده می‌زند — و بدتر،
 * diff دروغ می‌گوید که چیزی عوض شده.
 *
 * (این باگ توسطِ تستِ یکپارچه کشف شد، نه در بازبینیِ کد.)
 */
function sameAmount(a: string, b: string): boolean {
  const norm = (v: string) => {
    const [int = '0', frac = ''] = String(v).trim().split('.');
    return `${int.replace(/^\+?0+(?=\d)/, '')}.${frac.replace(/0+$/, '')}`;
  };
  return norm(a) === norm(b);
}

/**
 * ⚠️ همهٔ فیلدهای مالی مقایسه می‌شوند، نه فقط مبلغِ توافقی.
 *
 * نسخهٔ قبلی ردیفِ موجود را **بی‌قیدوشرط** UPDATE می‌کند، پس تغییرِ «نرخِ هر واحد»
 * یا ارز همیشه ذخیره می‌شود. اگر اینجا فقط `agreedAmount` را می‌سنجیدیم، در
 * پروژهٔ تعدادی — که کلِ دستمزد روی `unitRate` است — کاربر نرخ را عوض می‌کرد،
 * پیغامِ موفقیت می‌گرفت و هیچ‌چیز ذخیره نمی‌شد.
 */
function sameFinancials(existing: ExistingMember, input: MemberInput): boolean {
  return (
    sameAmount(existing.agreedAmount, input.agreedAmount) &&
    sameAmount(existing.unitRate ?? '0', input.unitRate ?? '0') &&
    (existing.currencyId ?? null) === (input.currencyId ?? null)
  );
}

/**
 * ⚠️ R-PROJ-09 — کلید (کاربر، نقش) است، نه فقط کاربر.
 * عضوِ دو-نقشه دو ردیف دارد و برای هر دو پول می‌گیرد؛ ولی نقشِ تکراریِ سهوی
 * ادغام می‌شود و **مبلغِ بزرگ‌تر برنده است**.
 */
function dedupe(
  rows: MemberInput[],
  inactiveUserIds: ReadonlySet<number>,
  primaryRoleOf: ReadonlyMap<number, number | null>,
): Map<string, MemberInput> {
  const out = new Map<string, MemberInput>();
  for (const raw of rows) {
    // R-PROJ-11 — عضوِ غیرفعال به‌عنوانِ انتخابِ جدید اضافه نمی‌شود.
    if (raw.userId <= 0 || inactiveUserIds.has(raw.userId)) continue;

    // R-PROJ-10 — نقشِ خالی نقشِ اصلیِ خودِ عضو را ارث می‌برد.
    const row: MemberInput = raw.roleTagId
      ? raw
      : { ...raw, roleTagId: primaryRoleOf.get(raw.userId) ?? null };

    const k = key(row.userId, row.roleTagId);
    const existing = out.get(k);
    if (existing && Number(existing.agreedAmount) >= Number(row.agreedAmount)) continue;
    out.set(k, row);
  }
  return out;
}

/**
 * ⚠️ R-PROJ-08 — به‌روزرسانی به‌صورتِ diff، نه پاک‌کن‌و‌بنویس.
 * دو دلیلِ مستقل:
 *  ۱. فقط اعضای **تازه‌اضافه‌شده** اعلان بگیرند، نه همه در هر ذخیره
 *  ۲. ردیفِ اعضای **سابق** حفظ شود — فرمِ ویرایش نشانشان نمی‌دهد ولی ممکن
 *     است هنوز تسویه‌ای بدهکار باشیم
 */
export function diffMembers(
  desired: MemberInput[],
  existing: ExistingMember[],
  options: DiffOptions = {},
): MemberDiff {
  const inactive = options.inactiveUserIds ?? new Set<number>();
  const owed = options.owedUserIds ?? new Set<number>();
  const wanted = dedupe(desired, inactive, options.primaryRoleOf ?? new Map());

  const byKey = new Map(existing.map((e) => [key(e.userId, e.roleTagId), e]));
  const usersBefore = new Set(existing.map((e) => e.userId));

  const toInsert: MemberInput[] = [];
  const toUpdate: Array<{ id: number; input: MemberInput }> = [];

  for (const [k, input] of wanted) {
    const found = byKey.get(k);
    if (!found) {
      toInsert.push(input);
    } else if (!sameFinancials(found, input)) {
      toUpdate.push({ id: found.id, input });
    }
  }

  /**
   * ردیف‌هایی که حتی با نبودن در فهرست هم می‌مانند:
   *  (الف) عضوِ غیرفعال — R-PROJ-08 §۲
   *  (ب) ⚠️ عضوِ فعالی که هنوز روی این پروژه طلب دارد — R-PROJ-23
   *
   * کاربری که **انتخاب شده** (با هر نقشی) از diff ِ عادی پیروی می‌کند، پس
   * تعویضِ عمدیِ نقش هنوز ردیفِ قبلی را جابه‌جا می‌کند.
   */
  const pickedUsers = new Set([...wanted.values()].map((r) => r.userId));

  /**
   * ⚠️ نگه‌داشتن باید **گزارش** شود. پیش از این ردیف فقط بی‌صدا می‌ماند:
   * کاربر عضو را از فهرست برمی‌داشت، «ذخیره شد» می‌دید، و عضو سرِ جایش
   * برمی‌گشت — بارها، بدونِ اینکه بفهمد چرا. قاعده درست است؛ سکوت نبود.
   */
  const keptOwed: number[] = [];
  const keptFormer: number[] = [];
  const toDelete = existing
    .filter((e) => {
      if (wanted.has(key(e.userId, e.roleTagId))) return false;
      if (inactive.has(e.userId)) {
        keptFormer.push(e.userId);
        return false;
      }
      if (!pickedUsers.has(e.userId) && owed.has(e.userId)) {
        keptOwed.push(e.userId);
        return false;
      }
      return true;
    })
    .map((e) => e.id);

  const newlyAdded = [...new Set(toInsert.map((r) => r.userId))].filter((id) => !usersBefore.has(id));

  return {
    toInsert,
    toUpdate,
    toDelete,
    newlyAdded,
    keptOwed: [...new Set(keptOwed)],
    keptFormer: [...new Set(keptFormer)],
  };
}

export interface AddMemberPlan {
  action: 'insert' | 'raise' | 'keep';
  /** ردیفی که باید به‌روز شود (فقط در حالتِ raise). */
  existingId?: number;
  /** نقشِ نهایی پس از ارث‌بری (R-PROJ-10). */
  roleTagId: number | null;
}

/**
 * افزودنِ سریعِ عضو از کارت.
 *
 * ⚠️ R-PROJ-24 — افزودنِ دوباره **هرگز** مبلغِ ذخیره‌شده را کم نمی‌کند.
 * فقط مبلغِ **بزرگ‌تر** (افزایشِ عمدی) می‌نشیند؛ ورودیِ کوچک‌تر یا خالی
 * ردیف را دست‌نخورده می‌گذارد. بدونِ این، یک کلیکِ سهوی روی «افزودن» با
 * فیلدِ خالی، مبلغِ توافقیِ عضو را صفر می‌کرد.
 */
export function planAddMember(
  input: { userId: number; roleTagId: number | null; agreedAmount: string },
  existing: ExistingMember[],
  options: {
    inactiveUserIds?: ReadonlySet<number>;
    primaryRoleOf?: ReadonlyMap<number, number | null>;
  } = {},
): AddMemberPlan | null {
  // R-PROJ-11 — عضوِ غیرفعال هرگز دوباره ساین نمی‌شود (پشتیبانِ سمتِ سرور).
  if (options.inactiveUserIds?.has(input.userId)) return null;

  const roleTagId = input.roleTagId ?? options.primaryRoleOf?.get(input.userId) ?? null;
  const found = existing.find((e) => e.userId === input.userId && e.roleTagId === roleTagId);

  if (!found) return { action: 'insert', roleTagId };
  if (Number(input.agreedAmount) > Number(found.agreedAmount)) {
    return { action: 'raise', existingId: found.id, roleTagId };
  }
  return { action: 'keep', existingId: found.id, roleTagId };
}
