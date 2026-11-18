import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';

/**
 * ترجیحاتِ داشبوردِ هر کاربر (۳.۱۸.۰) — روی خودِ کاربر (`users.dashboard_prefs`)، نه مرورگر:
 *  · `layouts`: چیدمانِ هر پنل (مدیر/عضو/کارفرما) — همان شیءِ Prefs ِ dashboard-grid، بی‌تفسیر اینجا؛
 *  · `note`: «یادداشتِ من» (فقط خودِ کاربر می‌بیند)؛
 *  · `hoursGoal`: هدفِ ساعتِ هفته.
 * ⚠️ هر سه را **فقط خودِ کاربر** می‌نویسد (اقدام‌ها requireActor دارند و در «دیدن به‌جای کاربر» بسته‌اند).
 */
export type DashScope = 'admin' | 'member' | 'client';
export const DASH_SCOPES: readonly DashScope[] = ['admin', 'member', 'client'];
export interface DashPrefs {
  layouts?: Partial<Record<DashScope, unknown>>;
  note?: string;
  hoursGoal?: number;
}

/** سقف‌ها — جلوی نوشتنِ دادهٔ بی‌اندازه در یک ستون را می‌گیرد. */
export const LAYOUT_MAX_BYTES = 64 * 1024;
export const NOTE_MAX_CHARS = 20_000;

export async function getDashPrefs(userId: number): Promise<DashPrefs> {
  const [row] = await db.select({ p: users.dashboardPrefs }).from(users).where(eq(users.id, userId));
  const p = (row?.p ?? {}) as DashPrefs;
  return {
    layouts: p.layouts && typeof p.layouts === 'object' ? p.layouts : undefined,
    note: typeof p.note === 'string' ? p.note : undefined,
    hoursGoal: typeof p.hoursGoal === 'number' ? p.hoursGoal : undefined,
  };
}

/** نوشتنِ یک کلید بی‌دست زدن به بقیه (ادغام در خودِ Postgres، نه خواندن و نوشتنِ کل). */
export async function setDashLayout(userId: number, scope: DashScope, layout: unknown): Promise<void> {
  const value = JSON.stringify(layout);
  await db.update(users).set({
    dashboardPrefs: sql`jsonb_set(
      ${users.dashboardPrefs} || jsonb_build_object('layouts', coalesce(${users.dashboardPrefs}->'layouts', '{}'::jsonb)),
      ${`{layouts,${scope}}`}::text[], ${value}::jsonb, true)`,
  }).where(eq(users.id, userId));
}

export async function setDashNote(userId: number, note: string): Promise<void> {
  await db.update(users).set({
    dashboardPrefs: sql`${users.dashboardPrefs} || jsonb_build_object('note', ${note}::text)`,
  }).where(eq(users.id, userId));
}

export async function setDashHoursGoal(userId: number, goal: number): Promise<void> {
  await db.update(users).set({
    dashboardPrefs: sql`${users.dashboardPrefs} || jsonb_build_object('hoursGoal', ${goal}::int)`,
  }).where(eq(users.id, userId));
}
