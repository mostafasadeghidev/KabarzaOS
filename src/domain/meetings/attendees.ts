/**
 * دعوت‌شدگانِ جلسه — ترجمهٔ.
 *
 * جلسه دو نوع دارد: وابسته به یک **پروژه**، یا **عمومی/تیمی** (بدونِ پروژه و
 * با دامنهٔ دفتر). فهرستِ کاندیداها و تیک‌های پیش‌فرض با نوع فرق می‌کنند.
 */

export interface Candidate {
  userId: number;
  name: string;
  /** زیرنویس: نقشِ عضو روی پروژه، «کارفرما»، «عضو» یا «مدیر کل». */
  sub: string;
  /** پیش‌فرض تیک‌خورده است؟ */
  checked: boolean;
}

export interface CandidateSources {
  /** اعضای پروژه (فقط برای جلسهٔ پروژه‌ای). */
  projectMembers?: Array<{ userId: number; name: string; roleName: string | null }>;
  /** کارفرمایانِ پروژه. */
  projectClients?: Array<{ userId: number; name: string }>;
  /** اعضای تیم در دامنهٔ دفترهای انتخابی (برای جلسهٔ عمومی). */
  officeMembers?: Array<{ userId: number; name: string }>;
  /** مالک و ادمین‌ها — همیشه قابلِ دعوت‌اند. */
  admins?: Array<{ userId: number; name: string }>;
  /** کاربرانی که off-board شده‌اند. */
  inactiveUserIds?: ReadonlySet<number>;
  /**
   * سازندهٔ جلسه — همیشه پیش‌فرض تیک می‌خورد.
   * ⚠️ بدونِ این، مدیرِ کل که جلسه را می‌سازد خودش دعوت‌نشده می‌ماند (قاعدهٔ ۲
   * مدیران را تیک‌نخورده می‌گذارد) و باید یادش باشد خودش را هم تیک بزند.
   * سازنده‌ای که عضوِ پروژه است هم که خودبه‌خود تیک دارد، پس این فقط همان
   * موردِ مدیر را درست می‌کند.
   */
  currentUserId?: number | null;
}

/**
 * ⚠️ سه قاعده:
 *  ۱. عضوِ off-board شده **هرگز** برای جلسهٔ جدید پیشنهاد نمی‌شود.
 *  ۲. مالک و ادمین‌ها همیشه در فهرست هستند ولی **پیش‌فرض تیک نمی‌خورند** —
 *     دعوتشان اختیاری است، نه خودکار.
 *  ۳. هر نفر یک بار می‌آید و **اولین** برچسبش می‌ماند: کسی که هم عضو است هم
 *     کارفرما، با نقشِ عضوش دیده می‌شود.
 */
export function meetingCandidates(
  kind: 'project' | 'general',
  sources: CandidateSources,
): Candidate[] {
  const inactive = sources.inactiveUserIds ?? new Set<number>();
  const out = new Map<number, Candidate>();

  const add = (userId: number, name: string, sub: string, checked: boolean) => {
    if (out.has(userId) || inactive.has(userId)) return;
    out.set(userId, { userId, name, sub, checked });
  };

  if (kind === 'project') {
    for (const m of sources.projectMembers ?? []) {
      add(m.userId, m.name, m.roleName ?? 'عضو', true);
    }
    for (const c of sources.projectClients ?? []) {
      add(c.userId, c.name, 'کارفرما', true);
    }
  } else {
    for (const m of sources.officeMembers ?? []) {
      add(m.userId, m.name, 'عضو', true);
    }
  }

  // قاعدهٔ ۲ — مدیران آخر می‌آیند و تیک‌نخورده.
  for (const a of sources.admins ?? []) {
    add(a.userId, a.name, 'مدیر کل', false);
  }

  // قاعدهٔ ۴ — سازنده همیشه تیک‌خورده است، هر جای فهرست که باشد.
  const me = sources.currentUserId ?? null;
  if (me !== null) {
    const mine = out.get(me);
    if (mine) out.set(me, { ...mine, checked: true });
  }

  return [...out.values()];
}

/** شناسهٔ کسانی که پیش‌فرض تیک دارند — مقدارِ اولیهٔ فرم. */
export function defaultAttendees(candidates: Candidate[]): number[] {
  return candidates.filter((c) => c.checked).map((c) => c.userId);
}
