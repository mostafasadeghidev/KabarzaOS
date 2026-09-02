import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { users } from '../schema';
import {
  completePasswordReset, issueResetToken, requestPasswordReset, sendInvite,
} from '@/server/auth/reset-service';
import { INVITE_TTL_MS, RESET_TTL_MS } from '@/domain/auth/reset';
import { verifyPassword } from '@/domain/auth/password';
import type { Actor } from '@/domain/access/permissions';

/** دعوت‌نامه و بازنشانیِ رمز — پورتِ send_invite + مسیرِ lostpassword. */

const ACTIVE = 1, LOCKED = 2;
const admin = (): Actor => ({ id: ACTIVE, roles: ['owner'], permissions: [], privateAccess: false });
const row = async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0]!;

beforeAll(async () => {
  await sql`truncate table audit_log, users restart identity cascade`;
  await db.insert(users).values([
    { email: 'a@t', name: 'فعال', username: 'ali' },
    { email: 'l@t', name: 'قطع‌شده', memberState: 'locked' },
  ]);
});

afterAll(async () => { await sql.end(); });

describe('لینکِ تعیینِ رمز', () => {
  it('توکنِ درست رمز را می‌گذارد، دعوت را مصرف می‌کند و توکن یک‌بارمصرف است', async () => {
    const now = new Date('2026-09-01T10:00:00Z');
    const token = await issueResetToken(ACTIVE, true, now);
    expect((await row(ACTIVE)).invitePending).toBe(true);
    expect((await row(ACTIVE)).resetTokenHash).not.toBe(token);

    expect(await completePasswordReset(token, 'short', now)).toBe('policy');
    expect(await completePasswordReset(token, 'correct-horse-battery', now)).toBe('ok');
    const after = await row(ACTIVE);
    expect(await verifyPassword(after.passwordHash!, 'correct-horse-battery')).toBe(true);
    expect(after.resetTokenHash).toBeNull();
    expect(after.invitePending).toBe(false);
    expect(await completePasswordReset(token, 'correct-horse-battery', now)).toBe('invalid');
  });

  it('⚠️ دعوت ۳ روز معتبر است، بازنشانیِ عادی ۱ روز', async () => {
    const now = new Date('2026-09-01T10:00:00Z');
    const invite = await issueResetToken(ACTIVE, true, now);
    expect(await completePasswordReset(invite, 'another-good-password', new Date(now.getTime() + INVITE_TTL_MS + 1000))).toBe('expired');
    const invite2 = await issueResetToken(ACTIVE, true, now);
    expect(await completePasswordReset(invite2, 'another-good-password', new Date(now.getTime() + 2 * RESET_TTL_MS))).toBe('ok');

    const plain = await issueResetToken(ACTIVE, false, now);
    expect(await completePasswordReset(plain, 'third-good-password', new Date(now.getTime() + RESET_TTL_MS + 1000))).toBe('expired');
  });

  it('توکنِ ساختگی «نامعتبر» است', async () => {
    expect(await completePasswordReset('deadbeef', 'whatever-password')).toBe('invalid');
    expect(await completePasswordReset('', 'whatever-password')).toBe('invalid');
  });
});

describe('«رمزم را فراموش کرده‌ام» و دعوت‌نامه — بدونِ ایمیلِ پیکربندی‌شده', () => {
  it('پاسخ برای حسابِ ناموجود و قطع‌شده و فعال یکی است و توکنی صادر نمی‌شود', async () => {
    await expect(requestPasswordReset('nobody@t')).resolves.toBeUndefined();
    await expect(requestPasswordReset('l@t')).resolves.toBeUndefined();
    await expect(requestPasswordReset('ALI')).resolves.toBeUndefined();
    expect((await row(LOCKED)).resetTokenHash).toBeNull();
    // بدونِ SMTP هیچ توکنی صادر نمی‌شود — لینکی که هرگز فرستاده نمی‌شود نباید وجود داشته باشد.
    const before = (await row(ACTIVE)).resetTokenHash;
    await requestPasswordReset('a@t');
    expect((await row(ACTIVE)).resetTokenHash).toBe(before);
  });

  it('دعوت‌نامه بدونِ ایمیلِ پیکربندی‌شده «no_mail» است و توکن نمی‌سازد', async () => {
    const before = (await row(ACTIVE)).resetTokenHash;
    expect(await sendInvite(admin(), ACTIVE, 'member', true)).toBe('no_mail');
    expect((await row(ACTIVE)).resetTokenHash).toBe(before);
    expect(await sendInvite(admin(), 999, 'member', true)).toBe('no_user');
  });
});
