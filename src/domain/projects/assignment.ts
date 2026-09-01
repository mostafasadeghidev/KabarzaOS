/**
 * تخصیصِ تسک — به یک **شخص** یا به چند **نقش**، هرگز هر دو.
 *
 * پورتِ `Frontend::parse_assignment()` و `valid_assignee()` ِ نسخهٔ قبلی.
 * سه قاعده، و هر سه سمتِ **سرور** لازم‌اند نه در UI:
 *
 * ۱. **شخص باید روی پروژه باشد.** کامنتِ خودِ نسخهٔ قبلی: «only someone
 *    actually on the project (member, client or a manager) may be assigned;
 *    anything else falls back to 0».
 * ۲. **نقش باید تگِ `member_role` باشد.** هر شناسهٔ دیگری کنار گذاشته
 *    می‌شود — نه خطا، فقط نادیده.
 * ۳. **شخص بر نقش مقدم است.** انتخابِ شخص نقش‌ها را پاک می‌کند، وگرنه
 *    تسکی می‌ماند که هم صاحب دارد هم بی‌صاحب است.
 *
 * ⚠️ چرا این تابع اصلاً وجود دارد: `createTask` مقدارها را **خام** درج
 * می‌کرد. تا وقتی فرم فقط به مدیر نشان داده می‌شد این فقط بی‌دقتی بود؛
 * به‌محضِ اینکه کارفرما هم بتواند تسک بسازد، تبدیل می‌شود به راهِ دورزدنِ
 * ماسکِ نام: کارفرما در UI فقط نقش‌ها را می‌بیند، ولی می‌تواند درخواست را
 * دستی بسازد و `assignedTo` را روی شناسهٔ یک عضوِ مشخص بگذارد — و از
 * پاسخ بفهمد آن شناسه کیست.
 */

export interface AssignmentInput {
  /** شناسهٔ شخصِ خواسته‌شده، یا null. */
  assignedTo: number | null;
  /** شناسهٔ نقش‌های خواسته‌شده. */
  roleTagIds: readonly number[];
}

export interface AssignmentFacts {
  /** شناسهٔ کسانی که واقعاً روی این پروژه‌اند — عضو یا کارفرما. */
  projectUserIds: ReadonlySet<number>;
  /** شناسهٔ تگ‌هایی که واقعاً از نوعِ `member_role` هستند. */
  memberRoleTagIds: ReadonlySet<number>;
  /**
   * بیننده فقط اجازهٔ تخصیص به **نقش** دارد؟ (کارفرمای خالص)
   * — پورتِ `if (! $client_view)` در `assign_options_html()`.
   */
  rolesOnly?: boolean;
}

export interface Assignment {
  assignedTo: number | null;
  roleTagIds: number[];
}

export function resolveAssignment(input: AssignmentInput, facts: AssignmentFacts): Assignment {
  /**
   * ⚠️ ترتیب مهم است: اول `rolesOnly` شخص را حذف می‌کند، بعد عضویت
   * بررسی می‌شود. برعکسش یعنی کارفرما بتواند با پاس‌دادنِ شناسهٔ یک عضوِ
   * واقعی از قاعده رد شود.
   */
  const wanted = facts.rolesOnly ? null : input.assignedTo;
  const person = wanted !== null && facts.projectUserIds.has(wanted) ? wanted : null;

  // قاعدهٔ ۳ — شخص نقش‌ها را پاک می‌کند.
  if (person !== null) return { assignedTo: person, roleTagIds: [] };

  const roleTagIds = [...new Set(input.roleTagIds)]
    .filter((id) => facts.memberRoleTagIds.has(id));

  return { assignedTo: null, roleTagIds };
}
