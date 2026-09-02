/**
 * وضعیتِ پیش‌فرضِ پروژه و تسکِ تازه — پورتِ `Projects::default_status_id()` و
 * `Tasks::default_status_tag_id()`.
 *
 * ⚠️ پیش از این پروژه/تسکی که بی‌وضعیت ساخته می‌شد **بی‌وضعیت می‌ماند**:
 * پروژه در هیچ تبِ پایپ‌لاین نبود (فقط زیرِ «همه»)، مناقصهٔ تازه به‌جای
 * «احتمالِ عقد قرارداد» بسته حساب می‌شد و کسی نمی‌توانست پیشنهاد بدهد، و
 * تسکِ تازه با چیپِ خالی فقط از راهِ fallback ِ برد به «شروع نشده» می‌رسید.
 */

export interface StatusTagLike {
  id: number;
  group: string | null;
}

/** مناقصه در «احتمالِ عقد قرارداد» شروع می‌شود، پروژهٔ عادی در «شروع نشده». */
export function defaultProjectStatusId(
  tags: readonly StatusTagLike[],
  isTender: boolean,
): number | null {
  const group = isTender ? 'lead' : 'not_started';
  return tags.find((t) => t.group === group)?.id ?? null;
}

/** اولین تگِ گروهِ `todo`؛ در نبودش اولین تگ. */
export function defaultTaskStatusId(tags: readonly StatusTagLike[]): number | null {
  return tags.find((t) => t.group === 'todo')?.id ?? tags[0]?.id ?? null;
}
