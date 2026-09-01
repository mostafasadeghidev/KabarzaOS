import { and, eq, inArray, isNull, or, sql as raw } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, tagRelations, userOffices, userPermissions, userRoles, users } from '@/db/schema';
import { canManageSection, canViewSection, type Actor, type Role } from '@/domain/access/permissions';
import { checkPasswordPolicy, hashPassword } from '@/domain/auth/password';
import { isValidUsername, normalizeIdentifier } from '@/domain/auth/login';
import {
  hiddenTabsFrom, hideRowsFor, isStorablePermission, levelsOf, permissionsFor, REPORT_TABS,
} from '@/domain/access/staff-levels';
import { assertCanManage, assertCanView, canSeeScope, ForbiddenError } from '@/domain/access/guard';
import {
  normalizeState, planRemovePerson, removeMessage,
  type MemberState, type RemoveOutcome,
} from '@/domain/people/offboarding';
import * as repo from './repository';

/**
 * سرویسِ افراد — اعضا و کارفرمایان.
 * ⚠️ همهٔ گاردها اینجا هستند، نه در صفحه (R-ARCH-01).
 */

export class PersonNotFoundError extends Error {
  constructor() {
    super('person_not_found');
    this.name = 'PersonNotFoundError';
  }
}

async function audit(actor: Actor, action: string, objectId: number, before?: unknown, after?: unknown) {
  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action,
    objectType: 'user',
    objectId,
    before: before ?? null,
    after: after ?? null,
  });
}

/** فهرستِ افراد + گزینه‌های فیلتر و فرم. */
export async function listPeople(actor: Actor, role: Role) {
  assertCanView(actor, 'members');

  const canManage = canManageSection(actor, 'members');

  const [people, officeList, roleTags, candidates] = await Promise.all([
    repo.listByRole(role),
    repo.officeOptions(),
    repo.roleTagOptions(),
    // ⚠️ فهرستِ کاندیداها فقط برای مدیر خوانده می‌شود؛ کسی که دکمهٔ افزودن
    // را نمی‌بیند، نباید فهرستِ کاربرانِ سامانه را هم بگیرد.
    canManage ? repo.usersWithoutRole(role) : Promise.resolve([]),
  ]);

  return {
    people,
    offices: officeList,
    roleTags,
    candidates,
    canManage,
    canSeeFinance: canViewSection(actor, 'finance'),
    // ⚠️ R-RBAC-05 — پیوندِ نام به پروفایلِ گزارش‌ها فقط برای کسی ساخته
    // می‌شود که گزارش‌ها را می‌بیند. نسخهٔ قبلی همیشه پیوند می‌داد چون صفحهٔ
    // «افراد» خودش ادمین‌محور بود؛ اینجا این دو مجوز جدا هستند و پیوندی که
    // به صفحهٔ «دسترسی ندارید» برسد بدتر از نبودنِ پیوند است.
    canViewReports: canViewSection(actor, 'reports'),
    // ⚠️ فقط مالک دکمهٔ «دسترسی‌ها» را می‌بیند (R-RBAC-10).
    isOwner: actor.roles.includes('owner'),
  };
}

export interface PersonInput {
  name: string;
  email: string;
  phone: string;
  /** نامِ کاربری برای ورود؛ خالی یعنی فقط با ایمیل وارد می‌شود. */
  username?: string;
  /** رمزِ اولیه؛ خالی یعنی کاربر هنوز نمی‌تواند وارد شود. */
  password?: string;
  /** گرنتِ دیدنِ پروژه‌های خصوصی. */
  privateAccess?: boolean;
  tagIds: number[];
  officeIds: number[];
  managedOfficeIds: number[];
}

/**
 * گرنتِ دیدِ خصوصی — فقط کسی که خودش دارد می‌تواند بدهد.
 *
 * ⚠️ بدونِ این گارد، همکارِ ادمینی که فقط `members.manage` دارد می‌توانست
 * برای دیگران (و با ویرایشِ خودش، برای خودش) دیدِ خصوصی بسازد — یعنی
 * ترفیعِ دسترسی از راهِ فرمِ اعضا.
 *
 * ⚠️ مقدارِ نامشخص یعنی «دست نزن»، نه «خاموش کن»: فرمی که این فیلد را
 * اصلاً ندارد نباید گرنتِ موجود را پاک کند.
 */
function resolvePrivateAccess(
  actor: Actor,
  requested: boolean | undefined,
  current: boolean,
): boolean {
  if (requested === undefined) return current;
  if (!canSeeScope(actor, 'private')) return current;
  return requested;
}

/** ساختِ فرد — نقشِ بخش را هم می‌گیرد. */
export async function createPerson(actor: Actor, role: Role, input: PersonInput): Promise<number> {
  assertCanManage(actor, 'members');

  const email = normalizeIdentifier(input.email);
  const username = normalizeIdentifier(input.username ?? '');

  /**
   * ⚠️ مقایسه روی حروفِ کوچک، چون شاخصِ یکتاییِ دیتابیس هم همان است.
   * با مقایسهٔ حساس‌به‌حروف، «A@x.com» از این گارد رد می‌شد و بعد به خطای
   * خامِ Postgres می‌خورد — یعنی پیامِ نامفهوم به‌جای «این ایمیل ثبت شده».
   */
  const clash = await db.select({ id: users.id }).from(users).where(
    username === ''
      ? raw`lower(${users.email}) = ${email}`
      : or(raw`lower(${users.email}) = ${email}`, raw`lower(${users.username}) = ${username}`),
  );
  if (clash.length > 0) throw new ForbiddenError('email.taken');
  if (username !== '' && !isValidUsername(username)) throw new ForbiddenError('username.invalid');

  /**
   * ⚠️ همان سیاستی که تغییرِ رمز اعمال می‌کند. پیش‌تر ساختِ کاربر هر رشته‌ای
   * را می‌پذیرفت، پس رمزی که از راهِ «تغییرِ رمز» رد می‌شد از راهِ «ساخت»
   * قابلِ کاشتن بود.
   */
  if (input.password) {
    const policy = checkPasswordPolicy(input.password);
    if (!policy.ok) throw new ForbiddenError(`password.${policy.reason}`);
  }

  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(users).values({
      name: input.name,
      email,
      username: username || null,
      phone: input.phone,
      // ⚠️ بدونِ رمز، ردیف ساخته می‌شود ولی ورود ممکن نیست — مدیر بعداً
      // از همان صفحه رمز می‌گذارد. هرگز رمزِ پیش‌فرضِ حدس‌زدنی نمی‌سازیم.
      passwordHash: input.password ? await hashPassword(input.password) : null,
      privateAccess: resolvePrivateAccess(actor, input.privateAccess, false),
    }).returning({ id: users.id });
    const userId = rows[0]!.id;

    await tx.insert(userRoles).values({ userId, role });
    await writeTags(tx, userId, input.tagIds);
    await writeOffices(tx, userId, input.officeIds, input.managedOfficeIds);
    return userId;
  });

  /**
   * ⚠️ رمز از ردِ ممیزی بیرون کشیده می‌شود. پیش‌تر کلِ ورودی اسپرد می‌شد،
   * یعنی رمزِ خام برای همیشه در جدولِ ممیزی می‌ماند — جایی که خیلی‌ها
   * دسترسیِ خواندن دارند و هیچ‌کس انتظارِ راز ندارد.
   */
  const { password: _omit, ...safe } = input;
  await audit(actor, 'person.create', id, null, { role, ...safe, hasPassword: Boolean(input.password) });
  return id;
}

/**
 * افزودنِ کاربرِ **موجود** به این بخش — معادلِ انتخابگرِ زندهٔ نسخهٔ قبلی.
 * ⚠️ کاربر دوباره ساخته نمی‌شود؛ فقط نقشِ این بخش به او اضافه می‌شود، تا
 * تاریخچه و ورودش دست‌نخورده بماند.
 */
export async function attachRole(
  actor: Actor,
  userId: number,
  role: Role,
  input?: Partial<PersonInput>,
) {
  assertCanManage(actor, 'members');
  const person = await repo.getPerson(userId);
  if (!person) throw new PersonNotFoundError();

  const roles = await repo.rolesOf(userId);
  const alreadyHad = roles.includes(role);

  await db.transaction(async (tx) => {
    if (!alreadyHad) await tx.insert(userRoles).values({ userId, role });

    /**
     * ⚠️ نام و ایمیل **دست نمی‌خورند**. کاربر از قبل وجود دارد و با همان
     * ایمیل وارد می‌شود؛ بازنویسیِ آن با محتوای فرم یعنی یک اشتباهِ تایپی
     * می‌تواند دسترسیِ کسی را قطع کند. فقط چیزهای مربوط به **این بخش**
     * نوشته می‌شوند.
     */
    if (input?.phone) {
      await tx.update(users).set({ phone: input.phone, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
    if (input?.tagIds?.length) await writeTags(tx, userId, input.tagIds);
    if (input?.officeIds || input?.managedOfficeIds) {
      await writeOffices(tx, userId, input.officeIds ?? [], input.managedOfficeIds ?? []);
    }
  });

  await audit(actor, 'person.attach', userId, null, { role, alreadyHad });
  return { added: !alreadyHad };
}

/**
 * کاربرانی که این نقش را **ندارند** — فهرستِ انتخابگرِ زنده.
 * ⚠️ کسی که همین نقش را دارد در فهرست نیست؛ وگرنه کاربر عملی را انتخاب
 * می‌کند که هیچ اثری ندارد.
 */
export async function attachCandidates(actor: Actor, role: Role) {
  assertCanManage(actor, 'members');
  return repo.usersWithoutRole(role);
}

/** ویرایشِ فرد. */
export async function updatePerson(actor: Actor, userId: number, input: PersonInput) {
  assertCanManage(actor, 'members');
  const before = await repo.getPerson(userId);
  if (!before) throw new PersonNotFoundError();

  /**
   * ⚠️ ایمیل و نامِ کاربری با هم و بی‌اعتنا به حروف بررسی می‌شوند — همان
   * قاعدهٔ `createPerson`. مقایسهٔ حساس‌به‌حروفِ قبلی «Ali@x.com» را تکراریِ
   * «ali@x.com» نمی‌دید، و نامِ کاربری اصلاً بررسی نمی‌شد چون این مسیر
   * هرگز نمی‌نوشتش — یعنی نامِ کاربری پس از ساخت غیرقابلِ تغییر بود.
   */
  const email = normalizeIdentifier(input.email);
  const username = normalizeIdentifier(input.username ?? '');
  if (username !== '' && !isValidUsername(username)) throw new ForbiddenError('username.invalid');

  const clash = await db.select({ id: users.id }).from(users).where(
    username === ''
      ? raw`lower(${users.email}) = ${email}`
      : or(raw`lower(${users.email}) = ${email}`, raw`lower(${users.username}) = ${username}`),
  );
  if (clash.some((c) => c.id !== userId)) throw new ForbiddenError('email.taken');

  await db.transaction(async (tx) => {
    await tx.update(users).set({
      name: input.name,
      email: input.email,
      phone: input.phone,
      // خالی یعنی «نامِ کاربری ندارد» — `null`، نه رشتهٔ خالی (شاخصِ یکتا).
      username: username || null,
      privateAccess: resolvePrivateAccess(actor, input.privateAccess, before.privateAccess),
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    await writeTags(tx, userId, input.tagIds);
    await writeOffices(tx, userId, input.officeIds, input.managedOfficeIds);
  });

  await audit(actor, 'person.update', userId, before, input);
}

/** تغییرِ حالتِ off-boarding — فعال / فقط مالی / قطع‌شده (R-PEOPLE-01). */
export async function setMemberState(actor: Actor, userId: number, raw: string) {
  assertCanManage(actor, 'members');
  const person = await repo.getPerson(userId);
  if (!person) throw new PersonNotFoundError();

  const state: MemberState = normalizeState(raw);
  await db.update(users)
    .set({ memberState: state, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await audit(actor, 'person.state', userId, person.memberState, state);
  return state;
}

/**
 * «حذف» — چهار سرانجام دارد و پیامش باید سرانجامِ **واقعی** را بگوید
 * (R-PEOPLE-02).
 */
export async function removePerson(
  actor: Actor,
  userId: number,
  role: Role,
): Promise<{ outcome: RemoveOutcome; message: string }> {
  assertCanManage(actor, 'members');

  const person = await repo.getPerson(userId);
  if (!person) {
    return { outcome: 'noop', message: removeMessage('noop') };
  }

  const roles = await repo.rolesOf(userId);
  const outcome = planRemovePerson({
    exists: true,
    hasOtherRoles: roles.some((r) => r !== role),
    isSystemAdmin: roles.includes('owner') || roles.includes('admin'),
    hasFootprint: await repo.hasFootprint(userId),
  });

  if (outcome === 'detached') {
    await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));
  } else if (outcome === 'deactivated') {
    await db.update(users)
      .set({ memberState: 'locked', updatedAt: new Date() })
      .where(eq(users.id, userId));
  } else if (outcome === 'deleted') {
    // حذفِ نرم — سوابقِ ممیزی به شناسه ارجاع می‌دهند.
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
  }

  await audit(actor, `person.remove.${outcome}`, userId, person, null);
  return { outcome, message: removeMessage(outcome) };
}

/* ------------------------------------------------------------------ *
 * کمکی‌ها — نوشتنِ تگ‌ها و دفاتر به‌صورتِ «جایگزینیِ کامل».
 * ------------------------------------------------------------------ */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function writeTags(tx: Tx, userId: number, tagIds: number[]) {
  await tx.delete(tagRelations).where(and(
    eq(tagRelations.objectType, 'user'),
    eq(tagRelations.objectId, userId),
  ));
  if (tagIds.length === 0) return;
  await tx.insert(tagRelations).values(
    tagIds.map((tagId) => ({ tagId, objectId: userId, objectType: 'user' as const })),
  );
}

async function writeOffices(tx: Tx, userId: number, officeIds: number[], managedIds: number[]) {
  await tx.delete(userOffices).where(eq(userOffices.userId, userId));
  if (officeIds.length === 0) return;
  const managed = new Set(managedIds);
  await tx.insert(userOffices).values(
    officeIds.map((officeId) => ({ userId, officeId, manages: managed.has(officeId) })),
  );
}

export { inArray };

/* ------------------------------------------------------------------ *
 * مجوزهای per-user — دسترسیِ همکارِ ادمین
 * ------------------------------------------------------------------ */

/**
 * ⚠️ R-RBAC-10 — **فقط مالک** دسترسیِ همکار را تغییر می‌دهد.
 * `members.manage` کافی نیست: وگرنه همکاری که مدیریتِ اعضا دارد می‌تواند به
 * خودش مالی و تنظیمات بدهد و گاردِ RBAC بی‌معنا می‌شود.
 */
function assertOwner(actor: Actor): void {
  if (!actor.roles.includes('owner')) throw new ForbiddenError('rbac.owner_only');
}

/** آیا این فرد اصلاً دسترسیِ قابلِ پیکربندی دارد؟ فقط «همکارِ ادمین». */
async function assertStaff(userId: number) {
  const roles = await repo.rolesOf(userId);
  if (!roles.includes('admin')) throw new ForbiddenError('rbac.not_staff');
}

/**
 * ⚠️ R-RBAC-11 — تلهٔ حیاتی: در نسخهٔ قبلی یک کارِ نگهداشتی این مجوزها را در هر
 * ارتقا پاک می‌کرد. هیچ عملیاتِ خودکاری نباید این جدول را کورکورانه خالی کند؛
 * فقط همین سرویس با تصمیمِ صریحِ مالک آن را می‌نویسد.
 */
export async function getAccessForm(actor: Actor, userId: number) {
  assertOwner(actor);
  await assertStaff(userId);

  const rows = await db.select({ permission: userPermissions.permission })
    .from(userPermissions).where(eq(userPermissions.userId, userId));
  const granted = rows.map((r) => r.permission);

  return {
    levels: levelsOf(granted),
    // تیک = نمایش؛ پس تبِ ناموجود در «پنهان» نمایان است.
    visibleTabs: REPORT_TABS.map((t) => t.key).filter((k) => !hiddenTabsFrom(granted).includes(k)),
  };
}

export async function setUserAccess(
  actor: Actor,
  userId: number,
  input: { levels: Record<string, string>; visibleTabs: string[] },
) {
  assertOwner(actor);
  await assertStaff(userId);

  const person = await repo.getPerson(userId);
  if (!person) throw new PersonNotFoundError();

  // فقط مقادیرِ شناخته‌شده — ورودی هرگز مجوزِ دلخواه نمی‌سازد.
  const rows = [
    ...permissionsFor(input.levels),
    ...hideRowsFor(input.visibleTabs),
  ].filter(isStorablePermission);
  const valid = [...new Set(rows)];

  await db.transaction(async (tx) => {
    await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
    if (valid.length > 0) {
      await tx.insert(userPermissions).values(valid.map((permission) => ({ userId, permission })));
    }
  });

  await audit(actor, 'person.permissions', userId, null, valid);
  return valid;
}

/** تب‌های گزارشی که این کاربر می‌بیند — مالک همیشه همه را می‌بیند. */
export async function visibleReportTabs(actor: Actor): Promise<string[]> {
  const all = REPORT_TABS.map((t) => t.key);
  if (actor.roles.includes('owner')) return all;

  const rows = await db.select({ permission: userPermissions.permission })
    .from(userPermissions).where(eq(userPermissions.userId, actor.id));
  const hidden = new Set(hiddenTabsFrom(rows.map((r) => r.permission)));
  return all.filter((k) => !hidden.has(k));
}

/**
 * فهرستِ همکارانِ ادمین — خانهٔ صفحهٔ «دسترسی‌ها».
 *
 * ⚠️ در نسخهٔ قبلی این پنل روی صفحهٔ کاربرانِ سامانهٔ قبلی بود؛ اینجا چنین صفحه‌ای
 * وجود ندارد، پس به تنظیمات (که خودش مالک‌محور است) منتقل شده تا این
 * قابلیت بی‌خانه و دست‌نیافتنی نماند.
 */
export async function listStaff(actor: Actor) {
  assertOwner(actor);

  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.role, 'admin'), isNull(users.deletedAt)))
    .orderBy(users.name);

  const perms = rows.length === 0 ? [] : await db
    .select({ userId: userPermissions.userId, permission: userPermissions.permission })
    .from(userPermissions)
    .where(inArray(userPermissions.userId, rows.map((r) => r.id)));

  const byUser = new Map<number, string[]>();
  for (const p of perms) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p.permission]);

  return rows.map((r) => ({ ...r, levels: levelsOf(byUser.get(r.id) ?? []) }));
}

/**
 * تعیینِ رمز برای فردِ دیگر — کارِ مدیرِ اعضا.
 *
 * ⚠️ رمزِ فعلی پرسیده نمی‌شود چون مدیر آن را نمی‌داند؛ به‌جایش خودِ عمل
 * در لاگِ ممیزی می‌نشیند تا معلوم باشد چه کسی رمزِ چه کسی را عوض کرده.
 *
 * ⚠️ مدیر رمزِ **خودش** را از این راه عوض نمی‌کند: آنجا رمزِ فعلی لازم
 * است (`changeMyPassword`)، وگرنه نشستِ دزدیده‌شده می‌توانست حساب را
 * بدزدد.
 */
export async function setPersonPassword(
  actor: Actor,
  userId: number,
  password: string,
): Promise<void> {
  assertCanManage(actor, 'members');
  if (userId === actor.id) throw new ForbiddenError('password.use_profile');

  const policy = checkPasswordPolicy(password);
  if (!policy.ok) throw new PasswordPolicyError(policy.reason ?? 'too_short');

  const person = await repo.getPerson(userId);
  if (!person) throw new PersonNotFoundError();

  await db.update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, userId));

  await audit(actor, 'person.password', userId, null, { changed: true });
}

export class PasswordPolicyError extends Error {
  constructor(readonly reason: 'too_short' | 'too_common') {
    super(reason);
    this.name = 'PasswordPolicyError';
  }
}
