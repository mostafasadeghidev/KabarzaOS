import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  accounts, currencies, ledger, meetings, offices, onboardingItems, paymentRequests, projects,
  qaItems, recurringExpenses, serviceGrants, services, tags, tasks, tenderBids, timelogs,
  unitEntries, users, vendors,
} from '@/db/schema';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { tagName } from '@/db/tag-name';
import type { Locale } from '@/i18n/config';
import type { RefKind, SubjectKind } from '@/domain/activity/details';

/**
 * نامِ «مورد»ها و شناسه‌های داخلِ رویداد — دسته‌ای، یک پرس‌وجو برای هر نوع
 * (R-PERF-01)، نه یکی برای هر ردیف.
 */

export interface Named {
  name: string;
  /** پروژهٔ مادر — برای تسک، کارکرد و … که بی‌پروژه گنگ‌اند. */
  projectId?: number | null;
  projectTitle?: string | null;
}

/** جوین به پروژه‌ای که هنوز هست — پروژهٔ حذف‌شده پیوند و نام نمی‌دهد. */
const liveProject = (column: AnyPgColumn) => and(eq(projects.id, column), isNull(projects.deletedAt));

type Loader = (ids: number[], locale: Locale) => Promise<Array<{ id: number } & Named>>;

/** ردیف‌هایی که نامشان «پروژه» است — کارکرد، درخواست، پیشنهاد. */
function viaProject(table: typeof unitEntries | typeof paymentRequests | typeof tenderBids): Loader {
  return (ids) => db
    .select({ id: table.id, name: projects.title, projectId: projects.id, projectTitle: projects.title })
    .from(table)
    .leftJoin(projects, liveProject(table.projectId))
    .where(inArray(table.id, ids))
    .then((rows) => rows.map((r) => ({ ...r, name: r.name ?? '' })));
}

const LOADERS: Partial<Record<SubjectKind | RefKind, Loader>> = {
  user: (ids) => db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)),
  // ⚠️ پروژهٔ حذف‌شده (نرم) «زنده» نیست — نامش از عکسِ خودِ رویداد می‌آید و پیوندی نمی‌گیرد.
  project: (ids) => db.select({ id: projects.id, name: projects.title }).from(projects)
    .where(and(inArray(projects.id, ids), isNull(projects.deletedAt))),
  task: (ids) => db
    .select({ id: tasks.id, name: tasks.title, projectId: projects.id, projectTitle: projects.title })
    .from(tasks).leftJoin(projects, liveProject(tasks.projectId)).where(inArray(tasks.id, ids)),
  bid: viaProject(tenderBids),
  unit: viaProject(unitEntries),
  payment_request: viaProject(paymentRequests),
  ledger: (ids) => db.select({ id: ledger.id, name: ledger.description }).from(ledger)
    .where(inArray(ledger.id, ids)),
  account: (ids) => db.select({ id: accounts.id, name: accounts.name }).from(accounts)
    .where(inArray(accounts.id, ids)),
  recurring: (ids) => db.select({ id: recurringExpenses.id, name: recurringExpenses.title })
    .from(recurringExpenses).where(inArray(recurringExpenses.id, ids)),
  meeting: (ids) => db.select({ id: meetings.id, name: meetings.title }).from(meetings)
    .where(inArray(meetings.id, ids)),
  timelog: (ids) => db
    .select({ id: timelogs.id, name: timelogs.logDate, projectId: projects.id, projectTitle: projects.title })
    .from(timelogs).leftJoin(projects, liveProject(timelogs.projectId)).where(inArray(timelogs.id, ids))
    .then((rows) => rows.map((r) => ({ ...r, name: String(r.name) }))),
  currency: (ids) => db.select({ id: currencies.id, name: currencies.code }).from(currencies)
    .where(inArray(currencies.id, ids)),
  tag: (ids, locale) => db.select({ id: tags.id, name: tagName(locale) }).from(tags)
    .where(inArray(tags.id, ids)),
  office: (ids) => db.select({ id: offices.id, name: offices.name }).from(offices)
    .where(inArray(offices.id, ids)),
  vendor: (ids) => db.select({ id: vendors.id, name: vendors.name }).from(vendors)
    .where(inArray(vendors.id, ids)),
  qa_item: (ids) => db.select({ id: qaItems.id, name: qaItems.title }).from(qaItems)
    .where(inArray(qaItems.id, ids)),
  service: (ids) => db.select({ id: services.id, name: services.name }).from(services)
    .where(inArray(services.id, ids)),
  service_grant: (ids) => db
    .select({ id: serviceGrants.id, service: services.name, person: users.name })
    .from(serviceGrants)
    .leftJoin(services, eq(services.id, serviceGrants.serviceId))
    .leftJoin(users, eq(users.id, serviceGrants.userId))
    .where(inArray(serviceGrants.id, ids))
    .then((rows) => rows.map((r) => ({ id: r.id, name: [r.service, r.person].filter(Boolean).join(' — ') }))),
  onboarding_item: (ids) => db.select({ id: onboardingItems.id, name: onboardingItems.title })
    .from(onboardingItems).where(inArray(onboardingItems.id, ids)),
};

/**
 * نام‌های یک دسته شناسه، به تفکیکِ نوع. نوعِ بی‌بارگذار و شناسهٔ پیدانشده
 * (موردِ حذف‌شده) در نقشه نیستند؛ نمایش به نامِ عکس‌گرفته یا «#id» برمی‌گردد.
 */
export async function namesOf(
  wanted: Array<{ kind: SubjectKind | RefKind; id: number }>,
  locale: Locale,
): Promise<Map<string, Named>> {
  const byKind = new Map<SubjectKind | RefKind, Set<number>>();
  for (const { kind, id } of wanted) {
    if (!LOADERS[kind] || !Number.isInteger(id) || id <= 0) continue;
    (byKind.get(kind) ?? byKind.set(kind, new Set()).get(kind)!).add(id);
  }
  const out = new Map<string, Named>();
  await Promise.all([...byKind].map(async ([kind, ids]) => {
    const rows = await LOADERS[kind]!([...ids], locale);
    for (const { id, ...named } of rows) out.set(`${kind}:${id}`, named);
  }));
  return out;
}
