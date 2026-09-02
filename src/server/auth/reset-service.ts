import { eq, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, users } from '@/db/schema';
import { canSignIn, type MemberState } from '@/domain/people/offboarding';
import {
  checkResetToken, hashResetToken, inviteMailLines, newResetToken, resetExpiry, resetMailLines,
  roleLabelFor,
} from '@/domain/auth/reset';
import { checkPasswordPolicy, hashPassword } from '@/domain/auth/password';
import { mailEnabled, sendMail } from '@/server/mail/transport';
import { getCompany } from '@/server/people/profile-service';
import { getT } from '@/i18n/server';
import type { Actor, Role } from '@/domain/access/permissions';

/**
 * دعوت‌نامه و بازنشانیِ رمز — پورتِ `People::send_invite()` و مسیرِ
 * `wp_lostpassword_url` ِ وردپرس.
 *
 * ⚠️ پیش از این هیچ راهِ خودخدمتی نبود: کاربرِ تازه ایمیلی نمی‌گرفت و کسی که
 * رمزش را فراموش می‌کرد فقط با دخالتِ مدیر برمی‌گشت.
 */

function appBase(): string {
  return (process.env.APP_URL ?? '').replace(/\/$/, '');
}

export function resetLink(token: string): string {
  return `${appBase()}/reset?token=${encodeURIComponent(token)}`;
}

async function siteName(): Promise<string> {
  const c = await getCompany().catch(() => null);
  return (c?.name ?? '').trim() || 'KabarzaOS';
}

/** توکنِ تازه — قبلی (اگر بود) باطل می‌شود. فقط هش ذخیره می‌شود. */
export async function issueResetToken(userId: number, invite: boolean, now = new Date()): Promise<string> {
  const token = newResetToken();
  await db.update(users).set({
    resetTokenHash: hashResetToken(token),
    resetExpiresAt: resetExpiry(now, invite),
    invitePending: invite,
    updatedAt: now,
  }).where(eq(users.id, userId));
  return token;
}

/**
 * «رمزم را فراموش کرده‌ام».
 *
 * ⚠️ هرگز نمی‌گوید حسابی هست یا نه — پاسخ همیشه یکی است. حسابِ قطع‌شده یا
 * حذف‌شده توکن نمی‌گیرد (نمی‌تواند وارد شود که بخواهد رمز داشته باشد).
 */
export async function requestPasswordReset(identifier: string, now = new Date()): Promise<void> {
  const id = identifier.trim().toLowerCase();
  if (id === '') return;
  const rows = await db.select().from(users).where(or(
    sql`lower(${users.email}) = ${id}`,
    sql`lower(${users.username}) = ${id}`,
  ));
  const user = rows[0];
  if (!user || !canSignIn(user.memberState as MemberState, user.deletedAt !== null)) return;
  if (!mailEnabled()) return;

  const token = await issueResetToken(user.id, false, now);
  const t = await getT();
  const mail = resetMailLines({ site: await siteName(), link: resetLink(token) }, t);
  await sendMail(user.email, mail.subject, mail.body);
  await db.insert(auditLog).values({
    actorType: 'user', actorId: user.id, action: 'auth.reset_requested', objectType: 'user', objectId: user.id,
  });
}

export type CompleteResult = 'ok' | 'invalid' | 'expired' | 'policy';

/** تعیینِ رمز از راهِ لینک — دعوت را هم «مصرف» می‌کند (پورتِ `after_password_reset`). */
export async function completePasswordReset(token: string, password: string, now = new Date()): Promise<CompleteResult> {
  if (!token) return 'invalid';
  const rows = await db.select().from(users).where(eq(users.resetTokenHash, hashResetToken(token)));
  const user = rows[0];
  if (!user) return 'invalid';
  const check = checkResetToken({ resetTokenHash: user.resetTokenHash, resetExpiresAt: user.resetExpiresAt }, token, now);
  if (check !== 'ok') return check;
  if (!checkPasswordPolicy(password).ok) return 'policy';

  await db.update(users).set({
    passwordHash: await hashPassword(password),
    resetTokenHash: null,
    resetExpiresAt: null,
    invitePending: false,
    updatedAt: now,
  }).where(eq(users.id, user.id));
  await db.insert(auditLog).values({
    actorType: 'user', actorId: user.id, action: 'auth.password_reset', objectType: 'user', objectId: user.id,
  });
  return 'ok';
}

export type InviteResult = 'sent' | 'no_mail' | 'no_user';

/**
 * دعوت‌نامه — پورتِ `send_invite()`: کاربرِ تازه لینکِ تعیینِ رمزِ ۳روزه، کاربرِ
 * موجود آدرسِ داشبورد. متن به زبانِ پنلِ **مدیر** ساخته می‌شود (همان رفتارِ افزونه).
 */
export async function sendInvite(actor: Actor, userId: number, role: Role, isNew: boolean): Promise<InviteResult> {
  const rows = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const email = rows[0]?.email ?? '';
  if (!email.includes('@')) return 'no_user';
  if (!mailEnabled()) return 'no_mail';

  const t = await getT();
  const link = isNew ? resetLink(await issueResetToken(userId, true)) : null;
  const mail = inviteMailLines({
    isNew, roleLabel: t(roleLabelFor(role)), site: await siteName(), link, dashboard: `${appBase()}/`,
  }, t);
  const sent = await sendMail(email, mail.subject, mail.body);
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action: 'person.invite', objectType: 'user', objectId: userId,
    after: { role, isNew, sent },
  });
  return sent ? 'sent' : 'no_mail';
}
