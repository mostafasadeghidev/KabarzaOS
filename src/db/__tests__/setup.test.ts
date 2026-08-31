import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { or, sql as raw } from 'drizzle-orm';
import { db, sql } from '../client';
import { users, userRoles } from '../schema';
import { installOwner, isInstalled, SetupError } from '@/server/setup/service';
import { attemptLogin, isValidUsername, type AuthUser } from '@/domain/auth/login';

/**
 * ویزاردِ نصب و ورودِ دوشناسه‌ای.
 *
 * ⚠️ این تنها مسیری است که **بدونِ احراز هویت** کاربر می‌سازد. تنها قفلش
 * «هیچ کاربری نیست» است، پس آن قفل باید از هر زاویه بسته باشد.
 */

const base = {
  firstName: 'مصطفی',
  lastName: 'صادقی',
  email: 'Boss@Example.COM',
  username: 'Mostafa',
  password: 'first-owner-9876',
  passwordRepeat: 'first-owner-9876',
};

beforeEach(async () => {
  await sql`truncate table user_roles, audit_log, users restart identity cascade`;
});

afterAll(async () => { await sql.end(); });

/** جست‌وجوی ورود — همان قاعدهٔ سرور. */
const lookup = {
  async findByIdentifier(identifier: string): Promise<AuthUser | null> {
    const rows = await db.select().from(users).where(or(
      raw`lower(${users.email}) = ${identifier}`,
      raw`lower(${users.username}) = ${identifier}`,
    ));
    const u = rows[0];
    return u ? {
      id: u.id, email: u.email, passwordHash: u.passwordHash,
      isActive: true, deletedAt: u.deletedAt,
    } : null;
  },
};

describe('نصبِ اولیه', () => {
  it('مالک ساخته می‌شود و نقشِ owner می‌گیرد', async () => {
    expect(await isInstalled()).toBe(false);
    const id = await installOwner(base);

    const [user] = await db.select().from(users);
    expect(user!.id).toBe(id);
    expect(user!.name).toBe('مصطفی صادقی');
    // ⚠️ هر دو شناسه نرمال ذخیره می‌شوند، وگرنه «Boss@…» هرگز پیدا نمی‌شد.
    expect(user!.email).toBe('boss@example.com');
    expect(user!.username).toBe('mostafa');

    const [role] = await db.select().from(userRoles);
    expect(role!.role).toBe('owner');
    expect(await isInstalled()).toBe(true);
  });

  it('⚠️ بارِ دوم بسته است — حتی با دادهٔ درست', async () => {
    await installOwner(base);
    await expect(installOwner({ ...base, email: 'other@example.com', username: 'other' }))
      .rejects.toMatchObject({ reason: 'already_installed' });
  });

  it('نامِ خانوادگی اختیاری است', async () => {
    await installOwner({ ...base, lastName: '' });
    const [user] = await db.select().from(users);
    expect(user!.name).toBe('مصطفی');
  });

  it('ورودیِ نامعتبر رد می‌شود و چیزی ساخته نمی‌شود', async () => {
    const bad: Array<[Partial<typeof base>, string]> = [
      [{ firstName: '  ' }, 'name_required'],
      [{ email: 'not-an-email' }, 'email_invalid'],
      [{ username: 'ab' }, 'username_invalid'],
      [{ username: 'a b c' }, 'username_invalid'],
      [{ username: 'user@host.com' }, 'username_invalid'],
      [{ password: 'short', passwordRepeat: 'short' }, 'password_too_short'],
      [{ password: 'password', passwordRepeat: 'password' }, 'password_too_common'],
      [{ passwordRepeat: 'something-else-99' }, 'password_mismatch'],
    ];

    for (const [patch, reason] of bad) {
      await expect(installOwner({ ...base, ...patch }), reason)
        .rejects.toBeInstanceOf(SetupError);
    }
    expect(await isInstalled()).toBe(false);
  });
});

describe('ورود با ایمیل یا نامِ کاربری', () => {
  it('هر دو شناسه کار می‌کنند، بی‌اعتنا به حروف', async () => {
    const id = await installOwner(base);

    for (const identifier of [
      'boss@example.com', 'BOSS@EXAMPLE.COM', 'mostafa', 'MoStAfA', '  mostafa  ',
    ]) {
      const result = await attemptLogin(lookup, identifier, base.password);
      expect(result, identifier).toEqual({ ok: true, userId: id });
    }
  });

  it('⚠️ رمزِ غلط و شناسهٔ ناموجود یک پیام می‌دهند — وجودِ حساب لو نمی‌رود', async () => {
    await installOwner(base);
    expect(await attemptLogin(lookup, 'mostafa', 'wrong-password'))
      .toEqual({ ok: false, reason: 'invalid_credentials' });
    expect(await attemptLogin(lookup, 'ghost', base.password))
      .toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('نامِ کاربریِ تکراری با شاخصِ دیتابیس رد می‌شود', async () => {
    await installOwner(base);
    // درجِ مستقیم — دور زدنِ سرویس، تا خودِ قید آزموده شود.
    await expect(
      db.insert(users).values({ name: 'دیگری', email: 'x@y.com', username: 'MOSTAFA' }),
    ).rejects.toThrow();
  });

  it('ایمیلِ تکراری هم با شاخص رد می‌شود', async () => {
    await installOwner(base);
    await expect(
      db.insert(users).values({ name: 'دیگری', email: 'BOSS@example.com' }),
    ).rejects.toThrow();
  });
});

describe('قاعدهٔ نامِ کاربری', () => {
  it('نام‌های مجاز و غیرمجاز', () => {
    for (const ok of ['ali', 'mostafa', 'a_b-c.d', 'user2024', 'abc']) {
      expect(isValidUsername(ok), ok).toBe(true);
    }
    for (const bad of ['ab', 'a b', '_ali', 'ali_', 'علی', 'a@b', '']) {
      expect(isValidUsername(bad), bad).toBe(false);
    }
  });
});

/**
 * ⚠️ لایه‌ای که جا مانده بود: **خودِ اکشنِ ورود**، نه فقط منطقِ دامنه.
 * اسکیمای فرم `.email()` داشت و نامِ کاربری را پیش از رسیدن به
 * `attemptLogin` رد می‌کرد؛ همهٔ تست‌های دامنه سبز بودند و باگ زنده.
 */
describe('اکشنِ ورود — لایهٔ فرم', () => {
  it('ورود با نامِ کاربری از اکشن هم می‌گذرد', async () => {
    await installOwner(base);
    const { login } = await import('@/app/login/actions');

    const form = new FormData();
    form.set('email', 'MOSTAFA');
    form.set('password', base.password);

    /**
     * موفقیت با `redirect()` اعلام می‌شود و Next آن را به‌صورتِ خطا پرتاب
     * می‌کند؛ پس «پرتاب» یعنی ورود موفق و «بازگشتِ مقدار» یعنی شکست.
     */
    let outcome: unknown;
    try {
      outcome = await login({}, form);
    } catch (error) {
      outcome = { redirected: true, digest: (error as { digest?: string }).digest };
    }
    expect(outcome).toMatchObject({ redirected: true });
  });

  it('شناسهٔ ناموجود پیامِ عمومی می‌دهد، نه خطای اعتبارسنجی', async () => {
    await installOwner(base);
    const { login } = await import('@/app/login/actions');
    const form = new FormData();
    form.set('email', 'ghost-user');
    form.set('password', 'whatever-123');
    await expect(login({}, form)).resolves.toMatchObject({
      error: expect.stringContaining('نادرست'),
    });
  });
});

