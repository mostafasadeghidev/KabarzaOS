/**
 * چه کسی وضعیتِ یک تسک را عوض می‌کند (۲.۳۹.۰).
 *
 * ⚠️ پیش از این هر کسی که روی پروژه «کار می‌کرد» وضعیتِ هر تسکِ دیدنی را عوض
 * می‌کرد (پورتِ `ajax_task_status`) — یعنی دولوپر می‌توانست کارِ همکارش را
 * «انجام شد» یا «نیاز به کارِ بیشتر» کند. حالا وضعیت مالِ صاحبِ کار است:
 *
 *  · مدیرِ پروژه/دفتر و مدیرِ کل — همه‌چیز (چرخهٔ بازبینی دستِ اوست)؛
 *  · تسکِ سپرده‌شده — فقط خودِ مسئول؛
 *  · تسکِ بی‌مسئول — دارندهٔ نقشی از نقش‌های تسک که آن نقش را کسِ دیگری
 *    برنداشته، یا سازندهٔ همان تسک.
 *
 * ⚠️ سازندهٔ تسکی که به **دیگری** سپرده شده وضعیتش را عوض نمی‌کند؛ کار مالِ
 * مسئول است. اگر باید برگردد، مدیر برمی‌گرداند.
 */
export interface TaskStatusAuthorityInput {
  userId: number;
  managesProject: boolean;
  assignedTo: number | null;
  createdBy: number | null;
  roles: ReadonlyArray<{ roleTagId: number | null; claimedBy: number | null }>;
  /** نقش‌های (تگِ `member_role`) خودِ بیننده روی همین پروژه. */
  userRoleTagIds: readonly number[];
}

export function canSetTaskStatus(input: TaskStatusAuthorityInput): boolean {
  if (input.managesProject) return true;
  if (input.assignedTo !== null) return input.assignedTo === input.userId;
  const holdsOpenRole = input.roles.some((r) =>
    r.roleTagId !== null
    && input.userRoleTagIds.includes(r.roleTagId)
    && (r.claimedBy === null || r.claimedBy === input.userId));
  return holdsOpenRole || input.createdBy === input.userId;
}
