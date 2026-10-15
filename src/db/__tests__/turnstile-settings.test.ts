import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, sql } from '../client';
import { users, userRoles, auditLog, schedulerStamps } from '../schema';
import {
  activeTurnstile, getTurnstileSettings, saveTurnstileKeys, setTurnstileEnabled, verifyTurnstile,
} from '@/server/settings/turnstile-service';
import type { Actor } from '@/domain/access/permissions';

/**
 * کپچای کلودفلر از پنل (۲.۳۱.۰). ⚠️ سه چیز: کلیدِ محرمانه نشت نکند (نه در نما،
 * نه در ممیزی، نه خام در پایگاه‌داده)، بی‌آزمون روشن نشود، و محیط برنده باشد.
 * تماسِ واقعی با کلودفلر اینجا نیست؛ آزمونِ کلید در مرورگر سنجیده شد.
 */

const SITE = '1x00000000000000000000AA';
const SECRET = '1x0000000000000000000000000000000AA';

let owner: Actor;
let plain: Actor;

beforeEach(async () => {
  await sql`truncate table user_roles, audit_log, users, scheduler_stamps restart identity cascade`;
  for (const k of ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_DISABLED']) delete process.env[k];
  const [o] = await db.insert(users).values({ name: 'Owner', email: 'o@x.com' }).returning({ id: users.id });
  const [u] = await db.insert(users).values({ name: 'User', email: 'u@x.com' }).returning({ id: users.id });
  await db.insert(userRoles).values([{ userId: o!.id, role: 'owner' }, { userId: u!.id, role: 'member' }]);
  owner = { id: o!.id, roles: ['owner'], permissions: ['settings.manage'], privateAccess: true };
  plain = { id: u!.id, roles: ['member'], permissions: ['settings.manage'], privateAccess: false };
});

afterAll(async () => { await sql.end(); });

describe('کپچای کلودفلر', () => {
  it('فقط مالک', async () => {
    await expect(getTurnstileSettings(plain)).rejects.toThrow();
    await expect(saveTurnstileKeys(plain, { siteKey: SITE, secret: SECRET })).rejects.toThrow();
  });

  it('⚠️ کلیدِ محرمانه خام ذخیره نمی‌شود و به نما و ممیزی نمی‌رود', async () => {
    expect(await saveTurnstileKeys(owner, { siteKey: SITE, secret: SECRET })).toBe('saved');
    const [row] = await db.select().from(schedulerStamps);
    expect(row!.value).not.toContain(SECRET);
    const view = await getTurnstileSettings(owner);
    expect(JSON.stringify(view)).not.toContain(SECRET);
    expect(view).toMatchObject({ siteKey: SITE, hasSecret: true, enabled: false, verified: false, active: false });
    const audits = await db.select().from(auditLog);
    expect(JSON.stringify(audits)).not.toContain(SECRET);
  });

  it('⚠️ بی‌آزمون روشن نمی‌شود؛ کپچای خاموش همه را می‌پذیرد', async () => {
    await saveTurnstileKeys(owner, { siteKey: SITE, secret: SECRET });
    expect(await setTurnstileEnabled(owner, true)).toBe('not_verified');
    expect(await activeTurnstile()).toBeNull();
    expect(await verifyTurnstile(null, null)).toBe(true);
  });

  it('کلیدِ نامعتبر رد می‌شود؛ رازِ خالی رازِ قبلی را نگه می‌دارد', async () => {
    expect(await saveTurnstileKeys(owner, { siteKey: 'bad', secret: SECRET })).toBe('invalid');
    expect(await saveTurnstileKeys(owner, { siteKey: SITE, secret: '' })).toBe('invalid');
    await saveTurnstileKeys(owner, { siteKey: SITE, secret: SECRET });
    expect(await saveTurnstileKeys(owner, { siteKey: SITE, secret: '' })).toBe('saved');
    expect((await getTurnstileSettings(owner)).hasSecret).toBe(true);
  });

  it('کلیدهای محیط: روشن و فقط‌خواندنی؛ پاسخِ خالی رد', async () => {
    process.env.TURNSTILE_SITE_KEY = SITE;
    process.env.TURNSTILE_SECRET_KEY = SECRET;
    expect(await activeTurnstile()).toEqual({ siteKey: SITE, secret: SECRET });
    expect(await saveTurnstileKeys(owner, { siteKey: SITE, secret: SECRET })).toBe('env_locked');
    expect(await verifyTurnstile('', null)).toBe(false);
    process.env.TURNSTILE_DISABLED = '1';
    expect(await activeTurnstile()).toBeNull();
  });
});
