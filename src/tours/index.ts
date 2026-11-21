import type { Tour, TourCtx, TourMeta } from './types';
import { tours as welcome } from './areas/welcome';
import { tours as projects } from './areas/projects';
import { tours as tasks } from './areas/tasks';
import { tours as hours } from './areas/hours';
import { tours as finance } from './areas/finance';
import { tours as team } from './areas/team';
import { tours as comms } from './areas/comms';
import { tours as client } from './areas/client';
import { tours as admin } from './areas/admin';

/** همهٔ راهنماها (۳.۱۹.۰). ترتیبِ فهرست با `order`. */
export const TOURS: Tour[] = [...welcome, ...projects, ...tasks, ...hours, ...finance, ...team, ...comms, ...client, ...admin]
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

export const tourById = (id: string) => TOURS.find((t) => t.id === id) ?? null;

/** قدم‌هایی که این کاربر می‌بیند (`when`). */
export const stepsFor = (t: Tour, c: TourCtx) => t.steps.filter((s) => !s.when || s.when(c));

/**
 * راهنماهایی که این کاربر می‌بیند — ⚠️ بی راهنمایی که همهٔ قدم‌هایش با `when` کنار رفته‌اند («شروع» بی‌صدا
 * کاری نمی‌کرد).
 */
export const toursFor = (c: TourCtx) => TOURS.filter((t) => t.audience(c) && stepsFor(t, c).length > 0);

/** فهرستِ سبک برای مرورگر (بی قدم‌ها و بی تابع) — `TourMeta`. */
export const catalogFor = (c: TourCtx): TourMeta[] => toursFor(c).map((t) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  ...(t.autoStart ? { autoStart: true } : {}),
  ...(t.next?.length ? { next: t.next } : {}),
}));
