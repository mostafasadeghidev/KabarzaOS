import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, schedulerStamps } from '@/db/schema';
import { can, type Actor } from '@/domain/access/permissions';
import { ForbiddenError } from '@/domain/access/guard';
import {
  DEFAULT_SYSTEM, normalizeSystem, type SystemConfig,
} from '@/domain/settings/system';

/**
 * تنظیماتِ سامانه — همان تنظیماتِ نسخهٔ قبلی، اینجا یک
 * ردیفِ JSON در جدولِ مهرهای زمان‌بند.
 *
 * ⚠️ خواندن **بدونِ مجوز** است و عمداً: نیمی از اپ (ضربانِ حضور، ترتیبِ هفته)
 * به این مقادیر نیاز دارد و اگر خواندن مجوز بخواهد، هر کاربرِ عادی صفحهٔ
 * سفید می‌بیند. نوشتن اما فقط `settings.manage`.
 */

const KEY = 'system:config';

export async function getSystemConfig(): Promise<SystemConfig> {
  const rows = await db.select({ value: schedulerStamps.value })
    .from(schedulerStamps).where(eq(schedulerStamps.key, KEY));

  if (!rows[0]) return withEnvZone(DEFAULT_SYSTEM);
  try {
    return withEnvZone(normalizeSystem(JSON.parse(rows[0].value) as Record<string, unknown>));
  } catch {
    // ⚠️ پیکربندیِ خراب نباید اپ را بخواباند.
    return withEnvZone(DEFAULT_SYSTEM);
  }
}

/** منطقهٔ زمانیِ خالی → مقدارِ محیط (`APP_TIMEZONE`)؛ در نبودش خالی می‌ماند (= UTC). */
function withEnvZone(config: SystemConfig): SystemConfig {
  return config.timezone ? config : { ...config, timezone: process.env.APP_TIMEZONE ?? '' };
}

export async function saveSystemConfig(
  actor: Actor,
  input: Partial<Record<keyof SystemConfig, unknown>>,
): Promise<SystemConfig> {
  if (!can(actor, 'settings.manage')) throw new ForbiddenError('settings.manage');

  const before = await getSystemConfig();
  const config = normalizeSystem(input);

  await db.insert(schedulerStamps)
    .values({ key: KEY, value: JSON.stringify(config) })
    .onConflictDoUpdate({
      target: schedulerStamps.key,
      set: { value: JSON.stringify(config), updatedAt: new Date() },
    });

  await db.insert(auditLog).values({
    actorType: 'user',
    actorId: actor.id,
    action: 'settings.system',
    objectType: 'settings',
    objectId: 0,
    before,
    after: config,
  });

  return config;
}
