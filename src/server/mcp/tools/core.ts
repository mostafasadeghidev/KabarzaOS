import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tags } from '@/db/schema';
import { tagName } from '@/db/tag-name';
import { currentLocale } from '@/i18n/server';
import { ForbiddenError } from '@/domain/access/guard';
import {
  addComment, createTask, getProjectDetail, listProjects, myTasks, setTaskStatus,
} from '@/server/projects/service';
import { taskStatusTags } from '@/server/projects/repository';
import { search } from '@/server/search/service';
import {
  addOrMerge, myLogs, myTotals, startTimer, stopTimer, timerState,
} from '@/server/timelogs/service';
import { hasTeamAvailability, teamMatrix } from '@/server/availability/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { compose, contactManagement, getRecipients } from '@/server/messaging/service';
import { createReminder, deleteReminder, listMeetings, listReminders } from '@/server/meetings/service';
import { formatDateTime, parseInZone } from '@/i18n/datetime';
import { can } from '@/domain/access/permissions';
import { DATE, run, todayIn, type Json, type Kit } from '../kit';

/** ابزارهای پایه (۲.۷.۰ تا ۲.۱۲.۰): تسک، ساعت، پیام، جلسه و یادآور. */
export function registerCore(kit: Kit) {
  const { server, actor, session, write, userZone } = kit;

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

  /* ---------------- جلسات و یادآورها (۲.۱۲.۰) ---------------- */

  server.registerTool('list_my_meetings', {
    title: 'Upcoming meetings',
    description: 'Upcoming meetings I can see (the same list as the Meetings page): time in my timezone, place, project and attendees.',
    annotations: { readOnlyHint: true },
  }, async () => run(async () => {
    const tz = await userZone();
    const { meetings } = await listMeetings(actor);
    return {
      timezone: tz,
      meetings: meetings.slice(0, 30).map((m) => ({
        id: m.id,
        title: m.title,
        at: formatDateTime(m.meetAt, tz),
        location: m.location || null,
        project: m.projectTitle,
        // ⚠️ نام‌ها همان ماسکِ برنامه را دارند (کارفرما نقش می‌بیند نه نام).
        attendees: m.attendees.map((a) => a.name),
      })),
    };
  }));

  server.registerTool('list_my_reminders', {
    title: 'My reminders',
    description: 'My personal reminders that have not fired yet, with ids for delete_reminder.',
    annotations: { readOnlyHint: true },
  }, async () => run(async () => {
    const tz = await userZone();
    const rows = await listReminders(actor);
    return {
      timezone: tz,
      reminders: rows.filter((r) => !r.isSent).slice(0, 50)
        .map((r) => ({ id: r.id, at: formatDateTime(r.remindAt, tz), text: r.body })),
    };
  }));

  server.registerTool('create_reminder', {
    title: 'Create a reminder',
    description: 'Create a personal reminder. `at` is local time in my timezone, format YYYY-MM-DD HH:mm. It must be in the future.',
    inputSchema: {
      at: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/, 'Use YYYY-MM-DD HH:mm'),
      text: z.string().min(1).max(500),
    },
  }, async (args) => write('create_reminder', args, async () => {
    const tz = await userZone();
    const when = parseInZone(args.at, tz);
    if (!when || when.getTime() <= Date.now()) return { created: false, error: 'The time must be in the future.' };
    const id = await createReminder(actor, { remindAt: when, body: args.text, leads: [0] });
    return { created: true, reminderId: id, at: formatDateTime(when, tz) };
  }));

  server.registerTool('delete_reminder', {
    title: 'Delete a reminder',
    description: 'Delete one of my reminders (id from list_my_reminders).',
    inputSchema: { reminder_id: z.number().int().positive() },
  }, async (args) => write('delete_reminder', args, async () => {
    // ⚠️ سرویس فقط یادآورِ خودِ کاربر را پاک می‌کند؛ شناسهٔ دیگری بی‌اثر است.
    const mine = (await listReminders(actor)).some((r) => r.id === args.reminder_id);
    if (!mine) return { deleted: false, error: 'Not found.' };
    await deleteReminder(actor, args.reminder_id);
    return { deleted: true };
  }));

  /* ---------------- پیام (۲.۱۱.۰) ---------------- */

  server.registerTool('list_message_recipients', {
    title: 'Who I can message',
    description: 'People I can send a direct message to (active members and clients), with ids for send_message. Managers are reached with message_management instead.',
    annotations: { readOnlyHint: true },
  }, async () => run(async () => {
    // ⚠️ بی مجوزِ ارسال، فهرست خالی است — همان قاعدهٔ صفحهٔ پیام‌ها.
    if (!can(actor, 'messages.send')) return { canSendDirect: false, recipients: [] };
    const rows = await getRecipients(actor);
    return { canSendDirect: true, recipients: rows.map((r) => ({ userId: r.id, name: r.name, role: r.role })) };
  }));

  server.registerTool('send_message', {
    title: 'Send a direct message',
    description: 'Send a new direct message to one or more people (ids from list_message_recipients). Each recipient gets their own conversation.',
    inputSchema: {
      recipient_user_ids: z.array(z.number().int().positive()).min(1).max(10),
      text: z.string().min(1).max(5000),
    },
  }, async (args) => write('send_message', args, async () => {
    const threads = await compose(actor, { recipientIds: args.recipient_user_ids, body: args.text, allowReply: true });
    return { sent: true, conversations: threads.length };
  }));

  server.registerTool('message_management', {
    title: 'Message the managers',
    description: 'Send a message to the management team (all managers in one shared conversation). Use this for "message my manager" when no specific person is named.',
    inputSchema: { text: z.string().min(1).max(5000) },
  }, async (args) => write('message_management', args, async () => {
    await contactManagement(actor, args.text);
    return { sent: true, to: 'management' };
  }));

}
