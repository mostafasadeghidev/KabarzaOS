/**
 * چه نامی از یک نفر به یک بیننده نشان داده شود.
 *
 * پورتِ `Dashboard::name_for_viewer()` ِ نسخهٔ قبلی. سه قاعده، به همین ترتیب:
 *
 * ۱. **مدیر نامِ واقعی را می‌بیند** — مالک/مدیرِ سراسری، مدیرِ همین پروژه
 *    (`pm`)، یا مدیرِ دفترِ مالکِ آن.
 * ۲. **کارفرما هرگز نامِ عضو را نمی‌بیند** — فقط نامِ نقشِ او روی همین
 *    پروژه («طراح»، «برنامه‌نویس»)، و اگر نقشی ثبت نشده «عضو تیم».
 * ۳. **عضو هرگز نامِ کارفرما را نمی‌بیند** — فقط واژهٔ «کارفرما».
 *
 * ⚠️ شرطِ «و نه آن‌یکی» در هر دو قاعده لازم است: کسی که هم عضو است هم
 * کارفرما (پیش می‌آید) هیچ‌کدام از دو ماسک را نمی‌خورد و نامِ واقعی را
 * می‌بیند — وگرنه یک نفر بسته به ترتیبِ چک، نامِ خودش را هم ماسک‌شده
 * می‌دید.
 *
 * ⚠️ این ماسک **ارائه‌ای** است، ولی باید سمتِ سرور اعمال شود: اگر نامِ
 * واقعی به کلاینت برود و آنجا پنهان شود، در payload ِ صفحه می‌ماند.
 */

export interface ViewerContext {
  /** بیننده این پروژه را مدیریت می‌کند؟ (سراسری ∨ pm ∨ مدیرِ دفتر) */
  managesProject: boolean;
  /** بیننده کارفرمای این پروژه است؟ */
  viewerIsClient: boolean;
  /** بیننده عضوِ این پروژه است؟ */
  viewerIsMember: boolean;
  /** نقشِ هر عضو روی این پروژه — `userId → نامِ نقش`. */
  roleByUser: ReadonlyMap<number, string>;
  /** شناسهٔ کارفرمایانِ این پروژه. */
  clientIds: ReadonlySet<number>;
}

/** برچسبِ جایگزینِ عضوی که نقشش ثبت نشده. */
export const FALLBACK_MEMBER_LABEL = 'عضو تیم';
/** برچسبِ جایگزینِ هر کارفرما برای بینندهٔ عضو. */
export const CLIENT_LABEL = 'کارفرما';

/**
 * نامی که این بیننده باید ببیند.
 *
 * @param userId شناسهٔ کسی که نامش نمایش داده می‌شود.
 * @param realName نامِ واقعی — وقتی هیچ ماسکی لازم نباشد همین برمی‌گردد.
 */
export function nameForViewer(
  userId: number,
  realName: string,
  ctx: ViewerContext,
): string {
  // ۱ — مدیر همه‌چیز را همان‌طور که هست می‌بیند.
  if (ctx.managesProject) return realName;

  // ۲ — کارفرمای خالص: عضوها را با نقششان می‌بیند.
  if (ctx.viewerIsClient && !ctx.viewerIsMember) {
    return ctx.roleByUser.get(userId) ?? realName;
  }

  // ۳ — عضوِ خالص: کارفرماها را فقط «کارفرما» می‌بیند.
  if (ctx.viewerIsMember && !ctx.viewerIsClient && ctx.clientIds.has(userId)) {
    return CLIENT_LABEL;
  }

  return realName;
}

/**
 * کارفرمای خالص فقط باید بتواند تسک/کامنت را به **نقش** بدهد، نه به شخص.
 * پورتِ `if (! $client_view)` در `assign_options_html()`.
 */
export function assignableToPeople(ctx: ViewerContext): boolean {
  return !(ctx.viewerIsClient && !ctx.viewerIsMember && !ctx.managesProject);
}
