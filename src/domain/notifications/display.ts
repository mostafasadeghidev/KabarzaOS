/**
 * نمایشِ اعلان — دسته‌بندی و شکستنِ بدنه.
 *
 * ⚠️ چرا دسته: عنوانِ ذخیره‌شده برای یک رویداد چند شکل دارد — «پیام جدید از
 * سارا» و «پاسخِ تازه از سارا» هر دو **پیام**‌اند — و کاربر از روی عنوان
 * نمی‌فهمید با چه چیزی طرف است. دسته از `type` می‌آید که ماشینی و ثابت است،
 * پس هر دو یک برچسب می‌گیرند.
 */

export type NotificationKind =
  | 'task' | 'comment' | 'meeting' | 'money' | 'message' | 'project' | 'other';

/** نوعِ اعلان → خانوادهٔ آن (برای نشان و برچسب). */
export function kindOf(type: string): NotificationKind {
  if (type.startsWith('task')) return 'task';
  if (type === 'comment' || type === 'review') return 'comment';
  if (type.startsWith('meeting')) return 'meeting';
  if (type.startsWith('payment')) return 'money';
  if (type.startsWith('message')) return 'message';
  if (type.startsWith('project') || type === 'tender_opened' || type === 'business') return 'project';
  return 'other';
}

export const KIND_LABEL: Record<NotificationKind, string> = {
  task: 'تسک',
  comment: 'کامنت',
  meeting: 'جلسه',
  money: 'مالی',
  message: 'پیام',
  project: 'پروژه',
  other: 'اعلان',
};

export interface BodyRow {
  label: string;
  value: string;
}

/**
 * بدنهٔ ساخت‌یافته → سطرهای جدا.
 *
 * ⚠️ اعلانِ جلسه یک رشتهٔ «زمان: … · مکان: … · پروژه: …» است. برای ایمیل و
 * تلگرام که سطرِ واحد لازم دارند درست است، ولی در مودال یک خطِ درهم می‌شد و
 * چشم باید دنبالِ نقطه‌ها می‌گشت. اینجا همان رشته به سطرهای «برچسب/مقدار»
 * باز می‌شود — بی‌آنکه چیزی در دیتابیس یا فایل‌های زبان عوض شود. جداکنندهٔ
 * ` · ` و شکلِ `برچسب: مقدار` در هر هشت زبان یکی است.
 *
 * ⚠️ **فقط** برای اعلانِ جلسه: تنها جایی است که سرور بدنه را ساخت‌یافته
 * می‌سازد. بدنهٔ پیام و کامنت و عنوانِ تسک متنِ آدم‌هاست و تکه‌کردنش سرِ «:»
 * جمله را وسط می‌شکند («باگ: صفحهٔ ورود» ⇒ برچسبِ «باگ»).
 *
 * @returns سطرها، یا `null` وقتی بدنه ساخت‌یافته نیست و باید دست‌نخورده بماند.
 */
export function structuredBody(type: string, body: string): BodyRow[] | null {
  if (!type.startsWith('meeting')) return null;

  const rows: BodyRow[] = [];
  for (const part of body.split(' · ')) {
    const match = /^([^:]{1,20}):\s*(.+)$/.exec(part.trim());
    if (!match) return null; // یک تکهٔ ناجور ⇒ کلِ بدنه دست‌نخورده می‌ماند.
    rows.push({ label: match[1]!.trim(), value: match[2]!.trim() });
  }
  return rows.length > 0 ? rows : null;
}
