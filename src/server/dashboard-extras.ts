import 'server-only';
import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { attachments, files, notifications, projectClients, projectQa, projects, tags, tasks, users } from '@/db/schema';
import { canViewSection, isOwner, type Actor } from '@/domain/access/permissions';
import { getClientsReport } from '@/server/reports/service';
import { listSalaries } from '@/server/finance/salaries';
import { listMemberAccounts } from '@/server/finance/member-accounts';
import { listRecurring } from '@/server/finance/payouts';
import { accessBoard } from '@/server/access/service';
import { readHistory, readStatus } from '@/server/backup/config';
import { myLogs, myTotals, timerState } from '@/server/timelogs/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { listAbsences } from '@/server/availability/absence-service';
import { getWeek } from '@/server/availability/service';
import { weekdayIndex } from '@/domain/availability/weekly';
import { getMyMoney, myMoneyTotals } from '@/server/finance/my-money';
import { membershipProjectIds } from '@/server/projects/authority';
import * as repo from '@/server/projects/repository';

/**
 * داده‌های کارت‌های تازهٔ داشبورد (نمونهٔ محلی) — مدیر، عضو و کارفرما.
 *
 * ⚠️ هر بخش از سرویسِ صفحهٔ خودش و با **گاردِ همان صفحه** می‌آید (حقوق ← listSalaries با finance.view،
 * دسترسی‌ها ← accessBoard با members.view، پشتیبان فقط مالک…). بخشی که بیننده حقش را ندارد یا خطا
 * می‌دهد `null` می‌شود و کارتش اصلاً ساخته نمی‌شود — یک بخشِ خراب کلِ داشبورد را نمی‌خواباند.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => iso(new Date(Date.now() + n * 86400000));
async function safe<T>(on: boolean, run: () => Promise<T>): Promise<T | null> {
  if (!on) return null;
  try { return await run(); } catch { return null; }
}

/* ───────────────────────────── مدیر ───────────────────────────── */

export interface Receivable { id: number; name: string; isFormer: boolean; lines: Array<{ code: string; due: string }>; projectCount: number }
export interface PayrollRow { userId: number; name: string; month: string; salaryId: number; amount: string; currencyCode: string | null; overdue: boolean }
export interface Renewal { id: number; title: string; amount: string; currencyCode: string | null; nextDueDate: string; vendorName: string | null; overdue: boolean }
export interface QaTick { id: number; title: string; projectId: number; projectTitle: string; byName: string | null; doneAt: string }
export interface AccessRisk { userId: number; name: string; memberState: string; grants: number }
export interface BackupGlance { ok: boolean | null; running: boolean; at: string | null; error: string | null; failsInRow: number }

export async function getAdminExtras(actor: Actor) {
  const today = iso(new Date());
  const [receivables, payroll, loans, renewals, qaTicks, access, backup] = await Promise.all([
    // طلب از کارفرماها — همان گزارشِ «کارفرمایان»، فقط آن‌ها که مانده دارند، بیشترین اول.
    safe(canViewSection(actor, 'reports'), async () => {
      const rows = await getClientsReport(actor);
      return rows
        .filter((r) => Number(r.due) > 0)
        .sort((a, b) => Number(b.due) - Number(a.due))
        .slice(0, 8)
        .map<Receivable>((r) => ({
          id: r.id, name: r.name, isFormer: !!r.isFormer, projectCount: r.projectCount,
          lines: r.byCurrency.filter((c) => Number(c.due) > 0).map((c) => ({ code: c.code ?? '', due: String(c.due) })),
        }));
    }),
    // حقوقِ این ماه و ماه‌های پرداخت‌نشدهٔ قبل.
    safe(canViewSection(actor, 'finance'), async () => {
      const rows = await listSalaries(actor);
      return rows.flatMap((r) => r.unpaid.map<PayrollRow>((u) => ({
        userId: r.userId, name: r.name ?? '', month: u.month, salaryId: u.salaryId,
        amount: String(u.amount), currencyCode: u.currencyCode ?? null, overdue: u.overdue,
      }))).sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.month.localeCompare(b.month)).slice(0, 10);
    }),
    // قرضِ سررسیدگذشتهٔ اعضا — قسط در همان «ثبتِ پرداختِ حقوق» کم می‌شود.
    safe(canViewSection(actor, 'finance'), async () => {
      const rows = await listMemberAccounts(actor);
      return rows.filter((r) => r.overdue).map((r) => ({ userId: r.userId, name: r.name ?? '' }));
    }),
    // تمدیدِ اشتراک‌ها و هزینه‌های دوره‌ای تا ۳۰ روزِ آینده (و عقب‌افتاده‌ها).
    safe(canViewSection(actor, 'finance'), async () => {
      const in30 = addDays(30);
      const rows = await listRecurring(actor);
      return rows
        .filter((r) => r.isActive && r.nextDueDate && r.nextDueDate <= in30)
        .slice(0, 10)
        .map<Renewal>((r) => ({
          id: r.id, title: r.title, amount: String(r.amount), currencyCode: r.currencyCode ?? null,
          nextDueDate: r.nextDueDate!, vendorName: r.vendorName ?? null, overdue: r.nextDueDate! < today,
        }));
    }),
    /*
     * تیک‌های تازهٔ کارفرما روی چک‌لیستِ QA (۱۴ روزِ اخیر) — تا مدیر کار را ببیند و بسنجد.
     * ⚠️ «بازبینیِ مدیر» حالتِ جدایی در پایگاه‌داده ندارد؛ این فهرست فقط تیک‌های کارفرماست.
     */
    safe(canViewSection(actor, 'projects'), async () => {
      const since = new Date(Date.now() - 14 * 86400000);
      const rows = await db
        .select({
          id: projectQa.id, title: projectQa.title, projectId: projectQa.projectId,
          projectTitle: projects.title, byName: users.name, doneAt: projectQa.doneAt,
        })
        .from(projectQa)
        .innerJoin(projects, eq(projects.id, projectQa.projectId))
        .innerJoin(projectClients, and(eq(projectClients.projectId, projectQa.projectId), eq(projectClients.userId, projectQa.doneBy)))
        .leftJoin(users, eq(users.id, projectQa.doneBy))
        .where(and(isNull(projectQa.roleTagId), eq(projectQa.isDone, true), gte(projectQa.doneAt, since), isNull(projects.deletedAt)))
        .orderBy(desc(projectQa.doneAt))
        .limit(12);
      return rows.map<QaTick>((r) => ({ ...r, doneAt: r.doneAt ? r.doneAt.toISOString() : '' }));
    }),
    // عضوِ سابقی که هنوز دسترسیِ باز دارد — از دفترِ دسترسی‌ها.
    safe(canViewSection(actor, 'members'), async () => {
      const board = await accessBoard(actor);
      const nameOf = new Map(board.people.map((p) => [p.id, p.name]));
      return board.risks.slice(0, 8).map<AccessRisk>((r) => ({
        userId: r.userId, name: nameOf.get(r.userId) ?? `#${r.userId}`, memberState: r.memberState, grants: r.grantIds.length,
      }));
    }),
    // سلامتِ پشتیبان — فقط مالک (همان گاردِ صفحهٔ پشتیبان).
    safe(isOwner(actor), async () => {
      const [status, history] = await Promise.all([readStatus(), readHistory()]);
      const last = status ?? history[0] ?? null;
      let failsInRow = 0;
      for (const h of history) { if (h.ok === false) failsInRow++; else if (h.ok) break; }
      return {
        ok: last?.ok ?? null, running: !!last?.running, at: last?.finishedAt ?? last?.startedAt ?? null,
        error: last?.error ?? null, failsInRow,
      } satisfies BackupGlance;
    }),
  ]);
  return { receivables, payroll, loans, renewals, qaTicks, access, backup };
}

/* ───────────────────────────── عضو ───────────────────────────── */

export interface ResumeInfo {
  running: { projectTitle: string | null; minutes: number } | null;
  last: { target: string; projectTitle: string | null; logDate: string; minutes: number } | null;
}
export interface MentionRow { id: number; title: string; body: string; url: string; createdAt: string }

export async function getMemberExtras(actor: Actor) {
  const isMember = actor.roles.includes('member');
  const today = iso(new Date());
  const [resume, mentions, leave, schedule, money, weekMinutes] = await Promise.all([
    safe(isMember, async (): Promise<ResumeInfo> => {
      const [state, logs] = await Promise.all([timerState(actor), myLogs(actor, { perPage: 1 })]);
      const l = logs.rows[0];
      return {
        running: state.running ? { projectTitle: state.running.projectTitle, minutes: state.running.minutes } : null,
        last: l ? {
          // همان قالبِ فیلدِ فرمِ ساعت: «پروژه» یا «پروژه:ردیفِ کارکرد»؛ خالی = ساعتِ عمومی.
          target: l.projectId ? (l.unitEntryId ? `${l.projectId}:${l.unitEntryId}` : String(l.projectId)) : '',
          projectTitle: l.projectTitle, logDate: l.logDate, minutes: l.minutes,
        } : null,
      };
    }),
    // منشن‌های خوانده‌نشده در کانال‌ها — از اعلان‌ها (جدولِ جدای منشن نداریم).
    safe(true, async () => {
      const rows = await db
        .select({ id: notifications.id, title: notifications.title, body: notifications.body, url: notifications.url, createdAt: notifications.createdAt })
        .from(notifications)
        .where(and(eq(notifications.userId, actor.id), eq(notifications.type, 'message.mention'), eq(notifications.isRead, false)))
        .orderBy(desc(notifications.id))
        .limit(8);
      return rows.map<MentionRow>((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    }),
    safe(isMember, async () => (await listAbsences(actor, actor.id, { upcomingOnly: true, today })).slice(0, 5)),
    // برنامهٔ هفتگی: امروز و فردا.
    safe(isMember, async () => {
      const week = await getWeek(actor.id);
      const now = new Date();
      const idx = weekdayIndex(now);
      return { today: week.get(idx) ?? [], tomorrow: week.get((idx + 1) % 7) ?? [], hasAny: [...week.values()].some((s) => s.length > 0) };
    }),
    // «پولِ من» — کارتِ پیش‌فرض‌خاموش (۳.۸.۳ از جلوی چشم برداشته شد).
    safe(isMember, async () => (await myMoneyTotals(actor)).member),
    // ساعتِ این هفته برای «هدفِ ساعت» — با همان آغازِ هفتهٔ تنظیمات.
    safe(isMember, async () => (await myTotals(actor, new Date(), (await getSystemConfig()).weekStart)).week),
  ]);
  return { resume, mentions, leave, schedule, money, weekMinutes };
}

/* ───────────────────────────── کارفرما ───────────────────────────── */

export interface ClientQa { id: number; title: string; description: string; projectId: number; projectTitle: string }
export interface ClientUpdate { kind: 'task' | 'file'; id: number; title: string; projectId: number; projectTitle: string; at: string }
export interface StatementRow {
  projectId: number; title: string; currencyCode: string | null; totalDue: string; paid: string; remaining: string;
  lastPayment: { paidAt: string; amount: string } | null;
}

export async function getClientExtras(actor: Actor) {
  if (!actor.roles.includes('client')) return { qa: null, updates: null, statement: null };
  const ids = await membershipProjectIds(actor.id, ['client']).catch(() => [] as number[]);
  const active = ids.length ? await repo.nonFrozenProjectIds(ids).catch(() => [] as number[]) : [];
  const since = new Date(Date.now() - 30 * 86400000);

  const [qa, updates, statement] = await Promise.all([
    // چک‌لیستِ QA ِ کارفرما (role_tag_id تهی) که هنوز تیک نخورده — همان‌جا تیک می‌خورد.
    safe(active.length > 0, async () => {
      const rows = await db
        .select({ id: projectQa.id, title: projectQa.title, description: projectQa.description, projectId: projectQa.projectId, projectTitle: projects.title })
        .from(projectQa)
        .innerJoin(projects, eq(projects.id, projectQa.projectId))
        .where(and(inArray(projectQa.projectId, active), isNull(projectQa.roleTagId), eq(projectQa.isDone, false)))
        .orderBy(projectQa.projectId, projectQa.id)
        .limit(30);
      return rows as ClientQa[];
    }),
    /*
     * تازه‌های پروژه (۳۰ روزِ اخیر): تسک‌های تمام‌شده و فایل‌های پروژه.
     * ⚠️ همان قاعدهٔ دیدِ کارفرما: تسکِ خصوصی و «پنهان از کارفرما» بیرون؛ فقط فایلِ خودِ پروژه
     * (نه رسانهٔ تسک/کامنت/بازبینی که گاردِ خودشان را دارند).
     */
    safe(ids.length > 0, async () => {
      const [done, fileRows] = await Promise.all([
        db.select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId, projectTitle: projects.title, at: tasks.updatedAt })
          .from(tasks)
          .innerJoin(tags, eq(tags.id, tasks.statusTagId))
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(and(
            inArray(tasks.projectId, ids), eq(tags.statusGroup, 'complete'), eq(tasks.isPrivate, false),
            eq(tasks.clientHidden, false), isNull(tasks.deletedAt), gte(tasks.updatedAt, since),
          ))
          .orderBy(desc(tasks.updatedAt)).limit(10),
        db.select({ id: attachments.id, title: attachments.label, fileName: files.originalName, url: attachments.externalUrl, projectId: projects.id, projectTitle: projects.title, at: attachments.createdAt })
          .from(attachments)
          .innerJoin(projects, eq(projects.id, attachments.projectId))
          .leftJoin(files, eq(files.id, attachments.fileId))
          .where(and(
            inArray(attachments.projectId, ids), isNull(attachments.taskId), isNull(attachments.commentId),
            isNull(attachments.reviewId), gte(attachments.createdAt, since),
          ))
          .orderBy(desc(attachments.createdAt)).limit(10),
      ]);
      return [
        ...done.map<ClientUpdate>((r) => ({ kind: 'task', ...r, at: r.at.toISOString() })),
        // برچسبِ خالی ← نامِ اصلیِ فایل، و برای پیوندِ بیرونی خودِ نشانی.
        ...fileRows.map<ClientUpdate>((r) => ({
          kind: 'file', id: r.id, projectId: r.projectId, projectTitle: r.projectTitle,
          title: r.title || r.fileName || r.url || '—', at: r.at.toISOString(),
        })),
      ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
    }),
    // صورتِ حساب — مانده و آخرین پرداختِ هر پروژه (getMyMoney: فقط رابطهٔ خودِ کاربر).
    safe(true, async () => {
      const m = await getMyMoney(actor);
      return m.clientProjects.map<StatementRow>((p) => {
        const last = [...p.payments].sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))[0];
        return {
          projectId: p.projectId, title: p.title, currencyCode: p.currencyCode ?? null,
          totalDue: String(p.totalDue), paid: String(p.paid), remaining: String(p.remaining),
          lastPayment: last ? { paidAt: String(last.paidAt).slice(0, 10), amount: String(last.amount) } : null,
        };
      });
    }),
  ]);
  return { qa, updates, statement };
}
