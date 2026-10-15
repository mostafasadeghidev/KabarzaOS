import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, sql } from '../client';
import { users, userRoles, auditLog, schedulerStamps } from '../schema';
import { getSmtpSettings, saveSmtpSettings, smtpConfig } from '@/server/settings/smtp-service';
import { mailEnabled } from '@/server/mail/transport';
import type { Actor } from '@/domain/access/permissions';

/**
 * ایمیلِ خروجی از پنل (۲.۳۲.۰). ⚠️ رمز نشت نکند (نه خام در پایگاه‌داده، نه در
 * نما، نه در ممیزی)، خانهٔ خالی رمز را پاک نکند، و محیط برنده باشد.
 */

const PASS = 'Sup3r-Secret-SMTP-pass';
let owner: Actor;
let plain: Actor;

beforeEach(async () => {
  await sql`truncate table user_roles, audit_log, users, scheduler_stamps restart identity cascade`;
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) delete process.env[k];
  const [o] = await db.insert(users).values({ name: 'Owner', email: 'o@x.com' }).returning({ id: users.id });
  const [u] = await db.insert(users).values({ name: 'User', email: 'u@x.com' }).returning({ id: users.id });
  await db.insert(userRoles).values([{ userId: o!.id, role: 'owner' }, { userId: u!.id, role: 'member' }]);
  owner = { id: o!.id, roles: ['owner'], permissions: ['settings.manage'], privateAccess: true };
  plain = { id: u!.id, roles: ['member'], permissions: ['settings.manage'], privateAccess: false };
});

afterAll(async () => { await sql.end(); });

describe('ایمیلِ خروجی', () => {
  it('فقط مالک', async () => {
    await expect(getSmtpSettings(plain)).rejects.toThrow();
  });

  it('⚠️ رمز خام ذخیره نمی‌شود و به نما و ممیزی نمی‌رود؛ سرور همان را می‌خواند', async () => {
    expect(await mailEnabled()).toBe(false);
    expect(await saveSmtpSettings(owner, { host: 'smtp.x.com', port: '465', user: 'me@x.com', password: PASS, from: '' })).toBe('saved');
    const [row] = await db.select().from(schedulerStamps);
    expect(row!.value).not.toContain(PASS);
    expect(JSON.stringify(await getSmtpSettings(owner))).not.toContain(PASS);
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain(PASS);
    expect(await smtpConfig()).toMatchObject({ host: 'smtp.x.com', port: 465, pass: PASS, from: 'me@x.com' });
    expect(await mailEnabled()).toBe(true);
  });

  it('رمزِ خالی رمزِ قبلی را نگه می‌دارد؛ پاک‌کردن ایمیل را خاموش می‌کند', async () => {
    await saveSmtpSettings(owner, { host: 'smtp.x.com', port: '587', user: 'me@x.com', password: PASS, from: '' });
    await saveSmtpSettings(owner, { host: 'smtp2.x.com', port: '587', user: 'me@x.com', password: '', from: '' });
    expect(await smtpConfig()).toMatchObject({ host: 'smtp2.x.com', pass: PASS });
    expect(await saveSmtpSettings(owner, { host: '', port: '', user: '', password: '', from: '', clear: true })).toBe('cleared');
    expect(await mailEnabled()).toBe(false);
  });

  it('ورودیِ نامعتبر و قفلِ محیط', async () => {
    expect(await saveSmtpSettings(owner, { host: 'https://x', port: '', user: '', password: '', from: '' })).toBe('invalid_host');
    expect(await saveSmtpSettings(owner, { host: 'smtp.x.com', port: '', user: '', password: '', from: 'nope' })).toBe('invalid_from');
    process.env.SMTP_HOST = 'env.x.com';
    expect(await saveSmtpSettings(owner, { host: 'smtp.x.com', port: '', user: '', password: '', from: '' })).toBe('env_locked');
    expect((await getSmtpSettings(owner)).fromEnv).toBe(true);
    expect((await smtpConfig())?.host).toBe('env.x.com');
  });
});
