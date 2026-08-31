import { describe, it, expect } from 'vitest';
import { attemptLogin, normalizeEmail, type AuthUser, type UserLookup } from './login';
import { hashPassword, verifyPassword, checkPasswordPolicy } from './password';
import { createSessionToken, readSessionToken } from './session';
import { canSignIn } from '../people/offboarding';

const SECRET = 'test-secret-at-least-32-characters-long';

async function makeUser(over: Partial<AuthUser> = {}): Promise<AuthUser> {
  return {
    id: 1,
    email: 'user@test',
    passwordHash: await hashPassword('correct-horse'),
    isActive: true,
    deletedAt: null,
    ...over,
  };
}

function lookupOf(user: AuthUser | null): UserLookup {
  return { findByIdentifier: async (email) => (user && user.email === email ? user : null) };
}

describe('رمز عبور', () => {
  it('هش و بررسی کار می‌کند', async () => {
    const h = await hashPassword('my-password');
    expect(await verifyPassword(h, 'my-password')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
  });

  it('هشِ خراب throw نمی‌کند، فقط false', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('هرگز دو هشِ یکسان تولید نمی‌شود (salt تصادفی)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('سیاستِ رمز: کوتاه و پرتکرار رد می‌شوند', () => {
    expect(checkPasswordPolicy('short').ok).toBe(false);
    expect(checkPasswordPolicy('password').ok).toBe(false);
    expect(checkPasswordPolicy('a-good-passphrase').ok).toBe(true);
  });
});

describe('ورود', () => {
  it('اطلاعاتِ درست موفق است', async () => {
    const u = await makeUser();
    expect(await attemptLogin(lookupOf(u), 'user@test', 'correct-horse')).toEqual({ ok: true, userId: 1 });
  });

  it('ایمیل نرمال می‌شود', async () => {
    const u = await makeUser();
    expect(normalizeEmail('  USER@Test  ')).toBe('user@test');
    const r = await attemptLogin(lookupOf(u), '  USER@Test  ', 'correct-horse');
    expect(r.ok).toBe(true);
  });

  it('رمزِ غلط رد می‌شود', async () => {
    const u = await makeUser();
    expect(await attemptLogin(lookupOf(u), 'user@test', 'nope')).toEqual({
      ok: false, reason: 'invalid_credentials',
    });
  });

  it('⚠️ ایمیلِ ناموجود همان پیامِ رمزِ غلط را می‌دهد (ضدِ user enumeration)', async () => {
    const missing = await attemptLogin(lookupOf(null), 'ghost@test', 'x');
    const wrongPass = await attemptLogin(lookupOf(await makeUser()), 'user@test', 'x');
    expect(missing).toEqual(wrongPass);
  });

  it('کاربرِ غیرفعال وارد نمی‌شود', async () => {
    const u = await makeUser({ isActive: false });
    expect(await attemptLogin(lookupOf(u), 'user@test', 'correct-horse')).toEqual({
      ok: false, reason: 'inactive',
    });
  });

  it('کاربرِ حذف‌شده (عضوِ سابق) وارد نمی‌شود', async () => {
    const u = await makeUser({ deletedAt: new Date() });
    const r = await attemptLogin(lookupOf(u), 'user@test', 'correct-horse');
    expect(r).toEqual({ ok: false, reason: 'inactive' });
  });

  it('محدودیتِ نرخ بعد از تلاش‌های ناموفق', async () => {
    const u = await makeUser();
    const r = await attemptLogin(lookupOf(u), 'user@test', 'correct-horse', { recentFailures: 10 });
    expect(r).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('کاربرِ بدونِ رمز (دعوت‌نشده) وارد نمی‌شود', async () => {
    const u = await makeUser({ passwordHash: null });
    const r = await attemptLogin(lookupOf(u), 'user@test', 'anything');
    expect(r).toEqual({ ok: false, reason: 'invalid_credentials' });
  });
});

describe('نشست', () => {
  it('توکن ساخته و خوانده می‌شود', async () => {
    const token = await createSessionToken({ userId: 42 }, SECRET);
    expect(await readSessionToken(token, SECRET)).toEqual({ userId: 42 });
  });

  it('کلیدِ اشتباه رد می‌شود', async () => {
    const token = await createSessionToken({ userId: 42 }, SECRET);
    expect(await readSessionToken(token, 'another-secret-32-characters-long!')).toBeNull();
  });

  it('توکنِ دستکاری‌شده رد می‌شود', async () => {
    const token = await createSessionToken({ userId: 42 }, SECRET);
    expect(await readSessionToken(token.slice(0, -3) + 'abc', SECRET)).toBeNull();
  });

  it('توکنِ منقضی رد می‌شود', async () => {
    const token = await createSessionToken({ userId: 42 }, SECRET, -10);
    expect(await readSessionToken(token, SECRET)).toBeNull();
  });

  it('نبودِ توکن null است، نه خطا', async () => {
    expect(await readSessionToken(undefined, SECRET)).toBeNull();
  });

  it('⚠️ نشست فقط شناسه دارد، نه مجوز', async () => {
    const token = await createSessionToken({ userId: 42 }, SECRET);
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'uid']);
  });
});

describe('⚠️ R-PEOPLE-03 — «فقط مالی» می‌تواند وارد شود', () => {
  /**
   * ماجرا: صفحهٔ ورود `memberState === 'active'` را می‌سنجید و عضوِ سابقِ
   * «فقط مالی» را هم بیرون می‌گذاشت — یعنی صفحهٔ تسویهٔ او که کلِ دلیلِ
   * وجودِ آن حالت است، اصلاً در دسترس نبود. تصمیم باید یک‌جا باشد.
   */
  it('حالتِ «فقط مالی» اجازهٔ ورود دارد، «قطع‌شده» نه', () => {
    expect(canSignIn('finance', false)).toBe(true);
    expect(canSignIn('active', false)).toBe(true);
    expect(canSignIn('locked', false)).toBe(false);
  });

  it('کاربرِ حذف‌شده در هیچ حالتی وارد نمی‌شود', () => {
    expect(canSignIn('finance', true)).toBe(false);
    expect(canSignIn('active', true)).toBe(false);
  });
});
