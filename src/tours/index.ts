import type { Tour, TourCtx } from './types';
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

/** راهنماهایی که این کاربر می‌بیند. */
export const toursFor = (c: TourCtx) => TOURS.filter((t) => t.audience(c));
