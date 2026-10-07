import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, tags } from '@/db/schema';
import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { ForbiddenError } from '@/domain/access/guard';
import {
  addComment, createTask, getProjectDetail, listProjects, myTasks, setTaskStatus,
} from '@/server/projects/service';
import { taskStatusTags } from '@/server/projects/repository';
import { search } from '@/server/search/service';
import {
  addOrMerge, myLogs, myTotals, startTimer, stopTimer, timerState, TimerError,
} from '@/server/timelogs/service';
import { hasTeamAvailability, teamMatrix } from '@/server/availability/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { assertWrite, type TokenSession } from './tokens';

/**
 * سرورِ MCP ِ Kabarza (۲.۷.۰) — ابزارهایی که Claude با آن‌ها روی برنامه کار می‌کند.
 *
 * ⚠️ قاعده‌های اصلی:
 *  1. هر ابزار **فقط سرویسِ موجود** را صدا می‌زند؛ گاردِ نقش، ماسکِ نام برای
 *     کارفرما، تسکِ خصوصی و «پنهان از کارفرما» همه همان‌جا اعمال می‌شوند.
 *  2. خروجی **فهرستِ سفید** است، نه خروجیِ خامِ سرویس: قیمتِ پروژه فقط با
 *     `canSeePrice`، و مبلغِ اعضا (توافقی/نرخ) هرگز.
 *  3. ابزارِ نوشتنی دامنهٔ `write` می‌خواهد و هر فراخوانش جدا در «رویدادها»
 *     ثبت می‌شود (`mcp.call`) — جدا از ممیزیِ خودِ سرویس.
 *  4. کارهای حساس (پول، حذف، دسترسی‌ها، اعضا) عمداً اینجا نیستند.
 */

type Json = Record<string, unknown> | unknown[];

/**
 * نوعِ محتوای پاسخ. ⚠️ ثابتِ جدا، نه رشتهٔ لفظی کنارِ کلیدِ type: تستِ نگاشتِ اعلان
 * (`gateway.test`) هر `type: '…'` ِ کد را نوعِ اعلان حساب می‌کند.
 */
const TEXT = 'text' as const;

function ok(data: Json) {
  return { content: [{ type: TEXT, text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: TEXT, text: message }], isError: true };
}

/** خطاهای تایمر به زبانِ مدل — تا بداند گامِ بعدی چیست، نه فقط «نشد». */
const TIMER_MESSAGES: Record<TimerError['code'], string> = {
  already_running: 'A timer is already running. Stop it first (stop_timer).',
  not_running: 'No timer is running.',
  nothing_pending: 'There is no long timer waiting for confirmation.',
};

/** خطای سرویس ← پیامِ قابلِ‌فهم برای مدل؛ جزئیاتِ داخلی بیرون نمی‌رود. */
function explain(error: unknown): string {
  if (error instanceof TimerError) return TIMER_MESSAGES[error.code];
  if (error instanceof ForbiddenError) {
    return `Not allowed (${error.message}). The token's owner does not have permission for this, or the token is read-only.`;
  }
  if (error instanceof Error && /not.?found/i.test(error.name + error.message)) return 'Not found.';
  return 'The request could not be completed.';
}

/** اجرای امنِ یک ابزار: خطا ← isError، نه کرشِ اتصال. */
async function run(fn: () => Promise<Json>) {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(explain(error));
  }
}

async function logCall(session: TokenSession, tool: string, args: unknown) {
  if (session.via === 'telegram') {
    // ربات توکنی ندارد؛ «مورد» ِ رویداد خودِ کاربر است.
    await db.insert(auditLog).values({
      actorType: 'user', actorId: session.actor.id, action: 'telegram.bot_call',
      objectType: 'user', objectId: session.actor.id, after: { tool, args, ai: true },
    });
    return;
  }
  await db.insert(auditLog).values({
    actorType: 'api_key',
    actorId: session.actor.id,
    action: 'mcp.call',
    objectType: 'api_key',
    objectId: session.keyId,
    // `name` = نامِ توکن — «مورد» ِ رویداد در «رویدادها» همین را نشان می‌دهد.
    after: { tool, args, name: session.name },
  });
}

/** تاریخِ امروز به وقتِ سامانه — `yyyy-mm-dd`. */
function todayIn(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(new Date());
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export function buildMcpServer(session: TokenSession): McpServer {
  const { actor } = session;
  const server = new McpServer(
    { name: 'kabarza', version: '2.9.0' },
    {
      instructions: [
        'Kabarza is an agency workspace: projects, tasks, work hours and team availability.',
        'Every tool acts as the token owner and sees only what they can see in the app.',
        'Use search or list_projects to find a project id before project-specific tools.',
        'Data is often in Persian; answer the user in their language.',
      ].join(' '),
    },
  );

  /** ابزارِ نوشتنی: دامنه + ثبتِ فراخوان، پیش از اجرای سرویس. */
  const write = async (tool: string, args: unknown, fn: () => Promise<Json>) => {
    try {
      assertWrite(session);
    } catch (error) {
      return fail(explain(error));
    }
    await logCall(session, tool, args);
    return run(fn);
  };

  /* ---------------- خواندنی ---------------- */

  server.registerTool('whoami', {
    title: 'Who am I',
    description: 'The token owner: id, roles, token scope, and today\'s date in the workspace timezone.',
    annotations: { readOnlyHint: true },
  }, async () => run(async () => {
    const tz = (await getSystemConfig()).timezone || 'UTC';
    return { userId: actor.id, roles: actor.roles, scopes: session.scopes, today: todayIn(tz), timezone: tz };
  }));

  server.registerTool('list_my_tasks', {
    title: 'My open tasks',
    description: 'Open tasks assigned to me (or claimable by my role), plus tasks waiting for review.',
    annotations: { readOnlyHint: true },
  }, async () => run(async () => {
    const inbox = await myTasks(actor);
    const shape = (t: { id: number; title: string; projectId: number; projectTitle: string | null; statusName: string | null; dueDate: string | null; mine: boolean }) => ({
      id: t.id, title: t.title, projectId: t.projectId, project: t.projectTitle,
      status: t.statusName, dueDate: t.dueDate, assignedToMe: t.mine,
    });
    return { active: inbox.active.map(shape), waiting: inbox.waiting.map(shape), review: inbox.review.map(shape) };
  }));

  server.registerTool('search', {
    title: 'Search',
    description: 'Search projects, members and clients by name (at least 2 characters).',
    inputSchema: { query: z.string().min(2).max(100) },
    annotations: { readOnlyHint: true },
  }, async ({ query }) => run(async () => {
    const hits = await search(actor, query);
    return hits.map((h) => ({ kind: h.kind, id: h.id, name: h.label }));
  }));

  server.registerTool('list_projects', {
    title: 'List projects',
    description: 'Projects I can see. By default only open (not archived, not closed) ones; filter by name with `query`.',
    inputSchema: {
      query: z.string().max(100).optional(),
      include_closed: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ query, include_closed }) => run(async () => {
    const rows = await listProjects(actor);
    const q = query?.trim().toLowerCase() ?? '';
    return rows
      .filter((p) => include_closed || (!p.isArchived && p.isClosed !== true))
      .filter((p) => !q || p.title.toLowerCase().includes(q))
      .slice(0, 100)
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.statusName,
        deadline: p.deadline,
        archived: p.isArchived,
        // ⚠️ مبلغ فقط برای کسی که در خودِ برنامه می‌بیندش.
        ...(p.canSeePrice ? { price: p.price, currency: p.currencyCode } : {}),
      }));
  }));

  server.registerTool('get_project', {
    title: 'Project details',
    description: 'One project: status, deadline, team (names and roles) and the tasks I can see.',
    inputSchema: { project_id: z.number().int().positive() },
    annotations: { readOnlyHint: true },
  }, async ({ project_id }) => run(async () => {
    const d = await getProjectDetail(actor, project_id);
    const [status] = d.project.statusTagId
      ? await db.select({ name: tagName(await currentLocale()) }).from(tags).where(eq(tags.id, d.project.statusTagId))
      : [];
    return {
      id: d.project.id,
      title: d.project.title,
      status: status?.name ?? null,
      deadline: d.project.deadline,
      canManage: d.canManage,
      // ⚠️ فهرستِ سفید: مبلغِ توافقی/نرخِ اعضا هیچ‌وقت اینجا نمی‌آید.
      team: d.members.map((m) => ({ userId: m.userId, name: m.userName, role: m.roleName })),
      clients: d.clients.map((c) => c.name),
      tasks: d.tasks.map((t) => ({
        id: t.id, title: t.title, status: t.statusName, assignee: t.assigneeName,
        dueDate: t.dueDate, private: t.isPrivate, waitingFor: t.blockedBy,
      })),
    };
  }));

  server.registerTool('list_task_statuses', {
    title: 'Task statuses',
    description: 'The task statuses that set_task_status accepts.',
    annotations: { readOnlyHint: true },
  }, async () => run(async () => (await taskStatusTags()).map((s) => ({ id: s.id, name: s.name, group: s.group }))));

  server.registerTool('my_hours', {
    title: 'My work hours',
    description: 'My logged hours in a date range (default: the last 7 days), with totals for this week and month.',
    inputSchema: { from: DATE.optional(), to: DATE.optional() },
    annotations: { readOnlyHint: true },
  }, async ({ from, to }) => run(async () => {
    const system = await getSystemConfig();
    const today = todayIn(system.timezone);
    const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
    const [logs, totals, timer] = await Promise.all([
      myLogs(actor, { from: from ?? weekAgo, to: to ?? today, perPage: 200 }),
      myTotals(actor, new Date(), system.weekStart),
      timerState(actor),
    ]);
    return {
      range: { from: from ?? weekAgo, to: to ?? today, minutes: logs.rangeMinutes },
      totals,
      timer: timer.running ? { project: timer.running.projectTitle, minutes: timer.running.minutes } : null,
      entries: logs.rows.map((r) => ({ date: r.logDate, project: r.projectTitle, minutes: r.minutes, description: r.description })),
    };
  }));

  server.registerTool('team_availability', {
    title: 'Who is available',
    description: 'For team managers: who is available right now, who is on leave, and each person\'s weekly schedule.',
    annotations: { readOnlyHint: true },
  }, async () => run(async () => {
    if (!(await hasTeamAvailability(actor))) throw new ForbiddenError('availability.team');
    const rows = await teamMatrix(actor);
    return rows.map((r) => ({
      userId: r.id, name: r.name, roles: r.roleNames,
      availableNow: r.availableNow, onLeave: r.onLeave, leaveUntil: r.leaveUntil, schedule: r.days,
    }));
  }));

  /* ---------------- نوشتنی ---------------- */

  server.registerTool('log_hours', {
    title: 'Log work hours',
    description: 'Log time on a project (or general work with project_id omitted). Same day and project merge into one entry.',
    inputSchema: {
      project_id: z.number().int().positive().optional(),
      date: DATE.optional(),
      hours: z.number().int().min(0).max(24).default(0),
      minutes: z.number().int().min(0).max(59).default(0),
      description: z.string().max(500).default(''),
    },
  }, async (args) => write('log_hours', args, async () => {
    const minutes = args.hours * 60 + args.minutes;
    if (minutes <= 0) throw new ForbiddenError('timelog.zero');
    const date = args.date ?? todayIn((await getSystemConfig()).timezone);
    const id = await addOrMerge(actor, {
      projectId: args.project_id ?? null, logDate: date, minutes, description: args.description,
    });
    return { logged: true, entryId: id, date, minutes };
  }));

  server.registerTool('start_timer', {
    title: 'Start timer',
    description: 'Start my work timer on a project (or general work with project_id omitted).',
    inputSchema: { project_id: z.number().int().positive().optional() },
  }, async (args) => write('start_timer', args, async () => {
    await startTimer(actor, args.project_id ?? null);
    return { started: true };
  }));

  server.registerTool('stop_timer', {
    title: 'Stop timer',
    description: 'Stop my running timer and log the time, with an optional note on what I worked on.',
    inputSchema: { description: z.string().max(500).default('') },
  }, async (args) => write('stop_timer', args, async () => {
    const result = await stopTimer(actor, args.description);
    return { stopped: true, result: result ?? null } as Json;
  }));

  server.registerTool('create_task', {
    title: 'Create task',
    description: 'Create a task in a project. The assignee must be on the project (team, client, or admins for managers); otherwise the task is left unassigned.',
    inputSchema: {
      project_id: z.number().int().positive(),
      title: z.string().min(1).max(200),
      description: z.string().max(5000).default(''),
      due_date: DATE.optional(),
      assignee_user_id: z.number().int().positive().optional(),
    },
  }, async (args) => write('create_task', args, async () => {
    const id = await createTask(actor, args.project_id, {
      title: args.title,
      description: args.description,
      statusTagId: null,
      priorityTagId: null,
      assignedTo: args.assignee_user_id ?? null,
      dueDate: args.due_date ?? null,
      isPrivate: false,
    });
    return { created: true, taskId: id };
  }));

  server.registerTool('set_task_status', {
    title: 'Change task status',
    description: 'Move a task to another status, by status name or id (see list_task_statuses).',
    inputSchema: { task_id: z.number().int().positive(), status: z.union([z.string().min(1), z.number().int()]) },
  }, async (args) => write('set_task_status', args, async () => {
    const statuses = await taskStatusTags();
    const wanted = String(args.status).trim().toLowerCase();
    const match = statuses.find((s) => String(s.id) === wanted || (s.name ?? '').toLowerCase() === wanted);
    if (!match) {
      return { changed: false, error: 'Unknown status', available: statuses.map((s) => s.name) };
    }
    await setTaskStatus(actor, args.task_id, match.id);
    return { changed: true, status: match.name };
  }));

  server.registerTool('add_comment', {
    title: 'Comment on a project',
    description: 'Post a comment in a project\'s comment thread.',
    inputSchema: { project_id: z.number().int().positive(), text: z.string().min(1).max(5000) },
  }, async (args) => write('add_comment', args, async () => {
    await addComment(actor, args.project_id, args.text);
    return { posted: true };
  }));

  return server;
}
