import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, sql } from '../client';
import { users, userRoles, auditLog } from '../schema';
import {
  getTelegramSettings, saveTelegramSettings, telegramCredentials, telegramEnabled,
} from '@/server/settings/telegram-service';
import type { Actor } from '@/domain/access/permissions';

/**
 * اعتبارِ باتِ تلگرام از پنل.
 *
 * ⚠️ این یک **راز** است. آزمون‌ها روی سه چیز تمرکز دارند: توکن به
 * لایهٔ نمایش نشت نکند، متغیرِ محیطی همیشه برنده باشد، و فیلدِ خالی
 * اتصالِ موجود را پاک نکند.
 */

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const OTHER = '987654321:BBHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

let owner: Actor;
let plain: Actor;

beforeEach(async () => {
  await sql`truncate table user_roles, audit_log, users, scheduler_stamps restart identity cascade`;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_USERNAME;

  const [o] = await db.insert(users).values({ name: 'Owner', email: 'o@x.com' }).returning({ id: users.id });
  const [u] = await db.insert(users).values({ name: 'User', email: 'u@x.com' }).returning({ id: users.id });
  await db.insert(userRoles).values([
    { userId: o!.id, role: 'owner' }, { userId: u!.id, role: 'member' },
  ]);
  owner = { id: o!.id, roles: ['owner'], permissions: ['settings.manage'], privateAccess: true };
  plain = { id: u!.id, roles: ['member'], permissions: [], privateAccess: false };
});

afterAll(async () => { await sql.end(); });

describe('ذخیره از پنل', () => {
  it('ذخیره می‌شود و سرور همان را می‌خواند', async () => {
    expect(await telegramEnabled()).toBe(false);
    expect(await saveTelegramSettings(owner, { token: TOKEN, username: '@my_bot' })).toBe('saved');

    expect(await telegramCredentials()).toEqual({ token: TOKEN, username: 'my_bot' });
    expect(await telegramEnabled()).toBe(true);
  });

  it('⚠️ توکن در چیزی که به صفحه می‌رود نیست — فقط «هست یا نه»', async () => {
    await saveTelegramSettings(owner, { token: TOKEN, username: 'my_bot' });
    const view = await getTelegramSettings(owner);

    expect(view).toEqual({ hasToken: true, username: 'my_bot', fromEnv: false });
    expect(JSON.stringify(view)).not.toContain(TOKEN);
  });

  it('⚠️ توکن در ردِ ممیزی هم ثبت نمی‌شود', async () => {
    await saveTelegramSettings(owner, { token: TOKEN, username: 'my_bot' });
    const rows = await db.select().from(auditLog);
    expect(JSON.stringify(rows)).not.toContain(TOKEN);
    expect(rows[0]!.action).toBe('settings.telegram.save');
  });

  it('ورودیِ نامعتبر ذخیره نمی‌شود', async () => {
    expect(await saveTelegramSettings(owner, { token: 'nope', username: 'my_bot' })).toBe('invalid');
    expect(await saveTelegramSettings(owner, { token: TOKEN, username: '' })).toBe('invalid');
    expect(await telegramEnabled()).toBe(false);
  });

  it('پاک‌کردن صریح است', async () => {
    await saveTelegramSettings(owner, { token: TOKEN, username: 'my_bot' });
    expect(await saveTelegramSettings(owner, { token: '', username: '', clear: true })).toBe('cleared');
    expect(await telegramEnabled()).toBe(false);
  });

  it('بدونِ مجوز رد می‌شود — هم خواندن هم نوشتن', async () => {
    await expect(getTelegramSettings(plain)).rejects.toThrow();
    await expect(saveTelegramSettings(plain, { token: TOKEN, username: 'my_bot' })).rejects.toThrow();
  });
});

describe('اولویتِ متغیرِ محیطی', () => {
  it('محیط بر مقدارِ ذخیره‌شده می‌چربد', async () => {
    await saveTelegramSettings(owner, { token: TOKEN, username: 'db_bot' });
    process.env.TELEGRAM_BOT_TOKEN = OTHER;
    process.env.TELEGRAM_BOT_USERNAME = 'env_bot';

    expect(await telegramCredentials()).toEqual({ token: OTHER, username: 'env_bot' });
    expect(await getTelegramSettings(owner)).toMatchObject({ fromEnv: true, username: 'env_bot' });
  });

  /**
   * ⚠️ وقتی محیط توکن می‌دهد، ذخیره از پنل باید **رد** شود، نه اینکه
   * بی‌صدا بنویسد: نوشتنِ مقداری که resolver بعداً نادیده می‌گیرد یعنی
   * مالک فکر می‌کند تغییرش اثر کرده.
   */
  it('وقتی محیط ست است، ذخیره قفل می‌شود', async () => {
    process.env.TELEGRAM_BOT_TOKEN = OTHER;
    expect(await saveTelegramSettings(owner, { token: TOKEN, username: 'my_bot' })).toBe('env_locked');
  });
});
