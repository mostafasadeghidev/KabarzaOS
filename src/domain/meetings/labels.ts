import { createTranslator, type Translator } from '@/i18n/translate';

/**
 * برچسبِ دعوت‌شدگانِ جلسه برای یک بیننده — پورتِ `Meetings::attendee_labels()`
 * و `attendees_detailed()`.
 *
 * ⚠️ R-MEET-08 / R-MSG-03: کارفرما نامِ اعضای تیم را نمی‌بیند (فقط نقششان)،
 * و تیم نامِ کارفرما را نمی‌بیند (فقط «کارفرما»). مالک همه را می‌بیند. پیش از
 * این کارتِ جلسه نامِ همه را چاپ می‌کرد — یعنی همان ماسکی که در صفحهٔ پروژه
 * رعایت می‌شد، در جلسات نشت داشت.
 *
 * ⚠️ ماسک **سمتِ سرور** اعمال می‌شود: اگر نامِ واقعی به کلاینت برود و آنجا
 * پنهان شود، در payload ِ صفحه می‌ماند.
 */

/** بدونِ مترجم همان فارسیِ مبدأ — کلید خودِ متنِ فارسی است. */
const SOURCE: Translator = createTranslator({});

export type AttendeeType = 'member' | 'client' | 'admin';

export interface AttendeePerson {
  userId: number;
  name: string;
  /** زیرنویس: نقشِ عضو روی پروژه، «کارفرما»، «مدیر کل» یا «عضو». */
  sub: string;
  type: AttendeeType;
}

export interface AttendeeViewer {
  /** مالک/مدیرِ سراسری — نامِ واقعیِ همه را می‌بیند. */
  isOwner: boolean;
  /** بیننده کارفرمای پروژهٔ همین جلسه است؟ */
  isClient: boolean;
}

/**
 * دسته‌بندیِ یک دعوت‌شده — نقشش روی پروژه، کارفرما، مدیر کل، وگرنه «عضو».
 * ⚠️ ترتیبِ اولویت همان نسخهٔ قبلی است: نقشِ پروژه پیش از کارفرما پیش از مدیر.
 */
export function classifyAttendee(
  userId: number,
  ctx: {
    roleByUser: ReadonlyMap<number, string | null>;
    clientIds: ReadonlySet<number>;
    adminIds: ReadonlySet<number>;
  },
): { sub: string; type: AttendeeType } {
  if (ctx.roleByUser.has(userId)) {
    return { sub: ctx.roleByUser.get(userId) || 'عضو', type: 'member' };
  }
  if (ctx.clientIds.has(userId)) return { sub: 'کارفرما', type: 'client' };
  if (ctx.adminIds.has(userId)) return { sub: 'مدیر کل', type: 'admin' };
  return { sub: 'عضو', type: 'member' };
}

/** برچسبِ آماده برای چاپ: «نام (زیرنویس)» یا فقط زیرنویس وقتی نام ماسک می‌شود. */
export function attendeeLabel(
  person: AttendeePerson,
  viewer: AttendeeViewer,
  t: Translator = SOURCE,
): string {
  let showName = true;
  if (!viewer.isOwner) {
    if (viewer.isClient && person.type === 'member') showName = false; // کارفرما نامِ عضو را نمی‌بیند.
    else if (!viewer.isClient && person.type === 'client') showName = false; // تیم نامِ کارفرما را نمی‌بیند.
  }
  const sub = t(person.sub);
  return showName ? `${person.name} (${sub})` : sub;
}
