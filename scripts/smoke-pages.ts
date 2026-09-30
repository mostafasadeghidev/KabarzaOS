/**
 * آزمونِ دودِ صفحه‌ها — پورتِ F#333–335: هر صفحه و هر تبِ اپ برای چند نقش
 * باز می‌شود و هر صفحه‌ای که خطای سرور بدهد گزارش می‌شود.
 *
 * چرا اسکریپت و نه تستِ واحد: صفحه‌ها کامپوننتِ سرورِ Next اند و بیرون از خودِ
 * Next رندر نمی‌شوند. این اسکریپت همان سرورِ در حالِ اجرا (`pnpm dev` یا
 * `pnpm start`) را با نشستِ واقعیِ هر نقش صدا می‌زند.
 *
 * اجرا:
 *   pnpm smoke                       # مالک، عضو و کارفرمای دادهٔ نمونه
 *   pnpm smoke -- a@b.test c@d.test  # کاربرانِ دلخواه (با ایمیل)
 *
 * ⚠️ هیچ رمزی لازم نیست و هیچ رمزی ذخیره نمی‌شود: نشست با همان
 * `SESSION_SECRET` ِ محلی امضا می‌شود (ده دقیقه اعتبار). برای همین فقط روی
 * نشانیِ **محلی** اجرا می‌شود — اسکریپتی که با رازِ سرور نشست می‌سازد هرگز نباید
 * به سرورِ واقعی اشاره کند.
 */
import { eq, isNull, and, asc } from 'drizzle-orm';
import { db, sql } from '../src/db/client';
import { projects, userRoles, users } from '../src/db/schema';
import { createSessionToken, SESSION_COOKIE } from '../src/domain/auth/session';
import { REPORT_TABS } from '../src/domain/access/staff-levels';

const BASE = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]+\.localhost|[^/]+\.test)(:\d+)?$/i;

/**
 * نشانه‌های خطای رندر در HTML ِ Next (مرزِ خطا). ⚠️ متنِ صفحهٔ خطای خودمان
 * («چیزی درست پیش نرفت») نشانه نیست: برای کاربرِ غیرفارسی کاتالوگِ ترجمه در
 * صفحه جاسازی می‌شود و کلیدهایش همین متن را دارند — هر صفحه خطا شمرده می‌شد.
 */
const ERROR_MARKERS = ['data-dgst=', '__next_error__'];

function pages(projectId: number | null): string[] {
  const list = [
    '/dashboard', '/projects', '/tasks', '/meetings', '/meetings?tab=reminders', '/messages', '/hours',
    '/notifications', '/notifications?show=all', '/comments', '/profile', '/my-money',
    '/availability', '/activity', '/members', '/clients', '/access', '/onboarding',
    '/finance', '/finance?tab=members', '/finance?tab=expenses', '/finance?tab=accounts', '/finance?tab=vendors',
    '/team', '/team?tab=projects', '/team?tab=tasks', '/team?tab=review', '/team?tab=comments',
    ...REPORT_TABS.map((t) => `/reports?tab=${t.key}`),
    ...['currencies', 'tags', 'offices', 'qa', 'company', 'staff', 'system', 'fiscal']
      .map((t) => `/settings?tab=${t}`),
  ];
  if (projectId !== null) {
    for (const tab of ['info', 'tasks', 'files', 'comments', 'finance', 'qa', 'manage']) {
      list.push(`/projects/${projectId}?tab=${tab}`);
    }
  }
  return list;
}

async function defaultEmails(): Promise<string[]> {
  // یک نفر از هر نقش — همان سه نگاهی که ممیزی می‌خواهد (مالک، عضو، کارفرما).
  const out: string[] = [];
  for (const role of ['owner', 'member', 'client'] as const) {
    const [row] = await db.select({ email: users.email }).from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, role), isNull(users.deletedAt)))
      .orderBy(asc(users.id)).limit(1);
    if (row && !out.includes(row.email)) out.push(row.email);
  }
  return out;
}

async function main() {
  if (!LOCAL.test(BASE)) {
    console.error(`smoke: only local addresses are allowed (got ${BASE}).`);
    process.exit(2);
  }
  const secret = process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32
    ? process.env.SESSION_SECRET
    : 'dev-only-secret-not-for-production-use';

  const emails = process.argv.slice(2).filter((a) => a.includes('@'));
  const targets = emails.length > 0 ? emails : await defaultEmails();
  const [firstProject] = await db.select({ id: projects.id }).from(projects)
    .where(isNull(projects.deletedAt)).orderBy(asc(projects.id)).limit(1);

  let failures = 0;
  for (const email of targets) {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()));
    if (!user) {
      console.error(`✗ ${email}: no such user`);
      failures++;
      continue;
    }
    const token = await createSessionToken({ userId: user.id }, secret, 600);
    console.log(`— ${email}`);
    for (const path of pages(firstProject?.id ?? null)) {
      const res = await fetch(`${BASE}${path}`, {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
        redirect: 'manual',
      }).catch((error: Error) => ({ status: 0, text: async () => error.message, headers: new Headers() }));
      const body = await res.text();
      const location = res.headers.get('location') ?? '';
      /**
       * ⚠️ برگشت به ورود یعنی نشست پذیرفته نشد — خودش خطاست. تغییرِ مسیرِ دیگر
       * (صفحه‌ای که این نقش ندارد و به خانه می‌برد) رفتارِ عمدیِ گارد است؛ بدنهٔ
       * آن پاسخ نشانِ redirect ِ Next را دارد و نباید خطا شمرده شود.
       */
      const redirected = res.status >= 300 && res.status < 400;
      const bad = res.status >= 400 || res.status === 0 || location.includes('/login')
        || (!redirected && ERROR_MARKERS.some((m) => body.includes(m)));
      if (bad) {
        failures++;
        console.log(`  ✗ ${res.status} ${path}${location ? ` → ${location}` : ''}`);
      } else {
        console.log(`  ✓ ${res.status} ${path}${redirected ? ` → ${location}` : ''}`);
      }
    }
  }
  await sql.end();
  console.log(failures === 0 ? 'smoke: all pages rendered' : `smoke: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
