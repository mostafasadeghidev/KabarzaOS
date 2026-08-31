/**
 * گیرندگانِ هر رویدادِ اعلان — پورتِ متدهای `Support\Notifications`.
 *
 * ⚠️ چرا دامنهٔ خالص و نه محاسبه در سرویس: فهرستِ گیرنده جایی است که اشتباه
 * **بی‌صدا** می‌ماند. اگر نویسندهٔ کامنت از فهرست بیرون نرود، برای خودش اعلان
 * می‌آید و کسی گزارشش نمی‌کند؛ اگر مدیرِ دفتر جا بیفتد، هیچ خطایی رخ نمی‌دهد
 * و فقط اعلانی نمی‌رسد. هر کدام اینجا تستِ خودش را دارد.
 */

/** ناتکراری، بدونِ صفر، و بدونِ کسانی که باید کنار بروند. */
function clean(ids: readonly number[], exclude: readonly number[] = []): number[] {
  const out = new Set<number>();
  const skip = new Set(exclude);
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0 || skip.has(id)) continue;
    out.add(id);
  }
  return [...out];
}

export interface TaskRoleRow {
  roleTagId: number;
  claimedBy: number | null;
}

export interface ProjectMemberRow {
  userId: number;
  roleTagId: number | null;
}

/**
 * «انجام‌دهندگانِ» یک تسک — پورتِ `task_doers`.
 *
 * ⚠️ ترتیب مهم است: مسئولِ مستقیم اگر باشد **تنها** گیرنده است. تسکِ نقشی
 * مسئولِ مستقیم ندارد، پس یا کسی که نقش را برداشته (claim) یا همهٔ اعضایی
 * که آن نقش را روی پروژه دارند.
 */
export function taskDoers(input: {
  assignedTo: number | null;
  roles: readonly TaskRoleRow[];
  members: readonly ProjectMemberRow[];
}): number[] {
  if (input.assignedTo) return clean([input.assignedTo]);

  const ids: number[] = [];
  for (const role of input.roles) {
    if (role.claimedBy) {
      ids.push(role.claimedBy);
      continue;
    }
    for (const m of input.members) {
      if (m.roleTagId === role.roleTagId) ids.push(m.userId);
    }
  }
  return clean(ids);
}

/**
 * کسانی که با تغییرِ تخصیص **تازه** مسئول شده‌اند — پورتِ
 * `task_assignment_changed`.
 *
 * ⚠️ خودِ ویرایش‌کننده کنار می‌رود: کسی که تسک را به خودش می‌دهد نباید به
 * خودش اعلان بفرستد.
 */
export function newlyAssigned(input: {
  after: readonly number[];
  before: readonly number[];
  editorId: number;
}): number[] {
  const had = new Set(input.before);
  return clean(input.after.filter((id) => !had.has(id)), [input.editorId]);
}

/**
 * مخاطبِ کامنتِ تازه — پورتِ `comment_added`:
 * مدیران + مدیرانِ دفترِ پروژه + اعضای پروژه + کارفرمایان، منهای نویسنده.
 */
export function commentAudience(input: {
  managerIds: readonly number[];
  officeManagerIds: readonly number[];
  memberIds: readonly number[];
  clientIds: readonly number[];
  authorId: number;
}): number[] {
  return clean(
    [...input.managerIds, ...input.officeManagerIds, ...input.memberIds, ...input.clientIds],
    [input.authorId],
  );
}

/**
 * مخاطبِ «تسک به ریویو رفت» — پورتِ `task_review`:
 * مدیران + مدیرانِ دفترِ پروژه + کارفرمایان.
 *
 * ⚠️ اعضای پروژه اینجا **نیستند** (برخلافِ کامنت): ریویو کارِ تصمیم‌گیرنده
 * است، نه اطلاعیهٔ عمومی. نسخهٔ قبلی هم همین تفکیک را دارد.
 */
export function reviewAudience(input: {
  managerIds: readonly number[];
  officeManagerIds: readonly number[];
  clientIds: readonly number[];
  actorId?: number;
}): number[] {
  return clean(
    [...input.managerIds, ...input.officeManagerIds, ...input.clientIds],
    input.actorId ? [input.actorId] : [],
  );
}
