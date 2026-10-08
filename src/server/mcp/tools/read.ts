import { z } from 'zod';
import { canViewSection } from '@/domain/access/permissions';
import { getDashboard } from '@/server/dashboard';
import { getMemberDashboard } from '@/server/dashboard-member';
import { getProjectTabs, getQaForm, getTaskDetail, getTaskFormOptions } from '@/server/projects/service';
import { getReview, listReviews } from '@/server/projects/reviews';
import { listInbox, openThread } from '@/server/messaging/service';
import { listNotificationFeed } from '@/server/notifications/service';
import { getCandidates, getMeetingFormOptions } from '@/server/meetings/service';
import { leaveTargets, listAbsences } from '@/server/availability/absence-service';
import { getWeek } from '@/server/availability/service';
import { onboardingBoard, onboardingDetail } from '@/server/onboarding/service';
import { teamMember, teamMembers, teamOverview, teamTasks } from '@/server/team/service';
import { listPeople } from '@/server/people/service';
import { accessBoard } from '@/server/access/service';
import { listActivity } from '@/server/activity/service';
import { getMyMoney } from '@/server/finance/my-money';
import { loggableProjects, myLogs } from '@/server/timelogs/service';
import {
  getAccountsReport, getAttendanceReport, getClientDetail, getClientsReport, getExpensesReport,
  getHoursReport, getMemberDetail, getMembersReport, getOverall, getProjectsReport, getUnitsReport,
} from '@/server/reports/service';
import { getLedger, listAccounts } from '@/server/finance/service';
import { listRecurring, listRequests } from '@/server/finance/payouts';
import { DATE, ID, run, type Json, type Kit } from '../kit';

/**
 * ابزارهای خواندنیِ کامل (۲.۱۳.۰) — هر صفحه‌ای که کاربر در سایت می‌بیند.
 *
 * ⚠️ هر ابزار همان تابعِ سرویسی را صدا می‌زند که page.tsx ِ همان صفحه؛ پس
 * کاربری که صفحه را نمی‌بیند، ابزار هم «اجازه نیست» می‌گیرد. خروجی از `shape`
 * ِ کیت می‌گذرد (راز و کلیدِ فایل حذف، اندازه مهار).
 */
export function registerRead(kit: Kit) {
  const { server, actor } = kit;
  const RO = { readOnlyHint: true } as const;
  const j = (fn: () => Promise<unknown>) => run(async () => (await fn()) as Json);

  server.registerTool('get_dashboard', {
    title: 'Dashboard',
    description: 'The same overview as the dashboard page: for managers the projects/finance overview, for members and clients their own dashboard.',
    inputSchema: { office_id: ID.optional() },
    annotations: RO,
  }, async ({ office_id }) => j(() => (canViewSection(actor, 'projects')
    ? getDashboard(actor, { officeId: office_id ?? null })
    : getMemberDashboard(actor))));

  server.registerTool('get_project_full', {
    title: 'Project (all tabs)',
    description: 'Everything the project page shows the user, by tab: overview, team, tasks, comments, files, qa, finance, bids. Pick sections to keep the answer small.',
    inputSchema: {
      project_id: ID,
      sections: z.array(z.enum(['project', 'members', 'clients', 'tasks', 'comments', 'files', 'qa', 'finance', 'bids', 'hours', 'permissions'])).optional(),
    },
    annotations: RO,
  }, async ({ project_id, sections }) => j(async () => {
    const tabs = await getProjectTabs(actor, project_id) as unknown as Record<string, unknown>;
    if (!sections || sections.length === 0) return tabs;
    // هر بخش = کلیدهای همان تبِ صفحهٔ پروژه.
    const SECTION_KEYS: Record<string, string[]> = {
      project: ['project', 'statusName', 'statusGroup', 'meta', 'currencyCode', 'isFrozen', 'tenderIsOpen'],
      members: ['members', 'roleHolders'],
      clients: ['clients'],
      tasks: ['tasks', 'qaTasks'],
      comments: ['comments'],
      files: ['files'],
      qa: ['qa'],
      finance: ['finance', 'payments', 'canSeeFinance', 'canSeePrice'],
      bids: ['bids'],
      hours: ['logs', 'hours', 'matrix', 'dayLabels'],
      permissions: ['canManage', 'canInteract', 'deleteState', 'impactCounts'],
    };
    const pick: Record<string, unknown> = {};
    for (const section of sections) {
      for (const key of SECTION_KEYS[section] ?? []) if (key in tabs) pick[key] = tabs[key];
    }
    return pick;
  }));

  server.registerTool('get_task', {
    title: 'Task details',
    description: 'One task with description, status, priority, assignee, due date, roles, notes (task conversation) and attachments.',
    inputSchema: { task_id: ID },
    annotations: RO,
  }, async ({ task_id }) => j(() => getTaskDetail(actor, task_id)));

  server.registerTool('task_form_options', {
    title: 'Task options for a project',
    description: 'Statuses, priorities, people and roles that can be used when creating or editing tasks in a project.',
    inputSchema: { project_id: ID },
    annotations: RO,
  }, async ({ project_id }) => j(() => getTaskFormOptions(actor, project_id)));

  server.registerTool('get_qa', {
    title: 'Project QA checklist',
    description: 'The QA checklist of a project and which library items/audiences can be applied.',
    inputSchema: { project_id: ID },
    annotations: RO,
  }, async ({ project_id }) => j(() => getQaForm(actor, project_id)));

  server.registerTool('list_reviews', {
    title: 'Project reviews',
    description: 'Review rounds of a project (video/site reviews) with their items.',
    inputSchema: { project_id: ID },
    annotations: RO,
  }, async ({ project_id }) => j(() => listReviews(actor, project_id)));

  server.registerTool('get_review', {
    title: 'One review',
    description: 'A single review round with all its items.',
    inputSchema: { review_id: ID },
    annotations: RO,
  }, async ({ review_id }) => j(() => getReview(actor, review_id)));

  server.registerTool('list_inbox', {
    title: 'Message inbox',
    description: 'My conversations (direct, management, channels, project groups) with unread counts and thread ids.',
    annotations: RO,
  }, async () => j(() => listInbox(actor)));

  server.registerTool('read_thread', {
    title: 'Read a conversation',
    description: 'Open one conversation and its messages (marks it read, like opening it in the app).',
    inputSchema: { thread_id: ID },
    annotations: RO,
  }, async ({ thread_id }) => j(() => openThread(actor, thread_id)));

  server.registerTool('list_notifications', {
    title: 'My notifications',
    description: 'My notifications (unread only by default).',
    inputSchema: { include_read: z.boolean().optional() },
    annotations: RO,
  }, async ({ include_read }) => j(() => listNotificationFeed(actor, { showAll: include_read === true })));

  server.registerTool('meeting_form_options', {
    title: 'Meeting options',
    description: 'Projects and offices I can create meetings for.',
    annotations: RO,
  }, async () => j(() => getMeetingFormOptions(actor)));

  server.registerTool('meeting_candidates', {
    title: 'Who can be invited',
    description: 'People that can be invited to a meeting of a project (or general meeting for offices).',
    inputSchema: { project_id: ID.optional(), office_ids: z.array(ID).optional() },
    annotations: RO,
  }, async ({ project_id, office_ids }) => j(() => getCandidates(actor, { projectId: project_id ?? null, officeIds: office_ids ?? [] })));

  server.registerTool('list_time_logs', {
    title: 'My time entries',
    description: 'My logged time entries with ids (for update_time_log), filtered by date range or project name.',
    inputSchema: { from: DATE.optional(), to: DATE.optional(), project: z.string().max(100).optional(), page: z.number().int().positive().optional() },
    annotations: RO,
  }, async (a) => j(() => myLogs(actor, { from: a.from ?? null, to: a.to ?? null, project: a.project ?? null, page: a.page, perPage: 50 })));

  server.registerTool('loggable_projects', {
    title: 'Projects I can log time on',
    description: 'Projects I can log hours or start a timer on.',
    annotations: RO,
  }, async () => j(() => loggableProjects(actor)));

  server.registerTool('my_schedule', {
    title: 'My weekly schedule and leave',
    description: 'My weekly availability (0 = Saturday … 6 = Friday) and my upcoming leave.',
    annotations: RO,
  }, async () => j(async () => ({
    week: Object.fromEntries(await getWeek(actor.id)),
    leave: await listAbsences(actor, actor.id, { upcomingOnly: true }),
  })));

  server.registerTool('list_leave', {
    title: 'Leave of a person',
    description: 'Leave periods of a person I manage (or myself). leave_targets lists who I can manage.',
    inputSchema: { user_id: ID, upcoming_only: z.boolean().optional() },
    annotations: RO,
  }, async ({ user_id, upcoming_only }) => j(() => listAbsences(actor, user_id, { upcomingOnly: upcoming_only === true })));

  server.registerTool('leave_targets', {
    title: 'Whose leave I can manage',
    description: 'People whose leave I can record (myself, and my team if I manage one).',
    annotations: RO,
  }, async () => j(() => leaveTargets(actor)));

  server.registerTool('team_overview', {
    title: 'My team overview',
    description: 'For team/office managers: team summary, members and their load.',
    annotations: RO,
  }, async () => j(() => teamOverview(actor)));

  server.registerTool('team_tasks', {
    title: 'My team tasks',
    description: 'For team managers: tasks of the team, filterable by status, priority or due (overdue|today|week).',
    inputSchema: { status_id: ID.optional(), priority_id: ID.optional(), due: z.string().max(20).optional() },
    annotations: RO,
  }, async (a) => j(() => teamTasks(actor, { statusTagId: a.status_id ?? null, priorityTagId: a.priority_id ?? null, due: a.due ?? null })));

  server.registerTool('team_members', {
    title: 'My team members',
    description: 'For team managers: each member with hours and tasks in a range (week|month|custom with from/to).',
    inputSchema: { range: z.string().max(20).optional(), from: DATE.optional(), to: DATE.optional() },
    annotations: RO,
  }, async (a) => j(() => teamMembers(actor, { range: a.range, from: a.from, to: a.to })));

  server.registerTool('team_member', {
    title: 'One team member',
    description: 'For team managers: one member in detail.',
    inputSchema: { user_id: ID, range: z.string().max(20).optional(), from: DATE.optional(), to: DATE.optional() },
    annotations: RO,
  }, async (a) => j(() => teamMember(actor, a.user_id, { range: a.range, from: a.from, to: a.to })));

  server.registerTool('list_people', {
    title: 'Members or clients',
    description: 'The members or clients list (same as the Members / Clients pages; needs that permission).',
    inputSchema: { role: z.enum(['member', 'client']) },
    annotations: RO,
  }, async ({ role }) => j(() => listPeople(actor, role)));

  server.registerTool('access_board', {
    title: 'Access register',
    description: 'Who has access to which service/account (no passwords are ever stored).',
    annotations: RO,
  }, async () => j(() => accessBoard(actor)));

  server.registerTool('onboarding_board', {
    title: 'Onboarding board',
    description: 'Onboarding progress of people.',
    annotations: RO,
  }, async () => j(() => onboardingBoard(actor)));

  server.registerTool('onboarding_detail', {
    title: 'Onboarding of a person',
    description: 'One person onboarding checklist with task ids (for onboarding_toggle).',
    inputSchema: { user_id: ID },
    annotations: RO,
  }, async ({ user_id }) => j(() => onboardingDetail(actor, user_id)));

  server.registerTool('list_activity', {
    title: 'Activity log',
    description: 'Events log (who did what), with text search and date range.',
    inputSchema: { q: z.string().max(100).optional(), from: DATE.optional(), to: DATE.optional(), page: z.number().int().positive().optional() },
    annotations: RO,
  }, async (a) => j(() => listActivity(actor, { page: a.page, perPage: 50, q: a.q, from: a.from, to: a.to })));

  server.registerTool('my_money', {
    title: 'My money',
    description: 'My earnings, payments and payment requests (same as My money page).',
    annotations: RO,
  }, async () => j(() => getMyMoney(actor)));

  server.registerTool('get_report', {
    title: 'Reports',
    description: 'A report from the Reports page: overall, members, clients, expenses, accounts, hours, projects, units, attendance; or one member/client in detail.',
    inputSchema: {
      kind: z.enum(['overall', 'members', 'clients', 'expenses', 'accounts', 'hours', 'projects', 'units', 'attendance', 'member', 'client']),
      user_id: ID.optional(),
      from: DATE.optional(),
      to: DATE.optional(),
      office_ids: z.array(ID).optional(),
    },
    annotations: RO,
  }, async (a) => j(async () => {
    const f = { officeIds: a.office_ids ?? [] };
    switch (a.kind) {
      case 'overall': return getOverall(actor, f);
      case 'members': return getMembersReport(actor, f);
      case 'clients': return getClientsReport(actor, f);
      case 'expenses': return getExpensesReport(actor, { from: a.from ?? '', to: a.to ?? '' });
      case 'accounts': return getAccountsReport(actor);
      case 'hours': return getHoursReport(actor, { ...f, from: a.from, to: a.to });
      case 'projects': return getProjectsReport(actor, f);
      case 'units': return getUnitsReport(actor);
      case 'attendance': return getAttendanceReport(actor);
      case 'member': return a.user_id ? getMemberDetail(actor, a.user_id) : { error: 'user_id is required' };
      case 'client': return a.user_id ? getClientDetail(actor, a.user_id) : { error: 'user_id is required' };
    }
  }));

  server.registerTool('finance_accounts', {
    title: 'Finance accounts',
    description: 'Accounts (cash, bank, …) with balances — same as the Finance page.',
    annotations: RO,
  }, async () => j(() => listAccounts(actor)));

  server.registerTool('finance_ledger', {
    title: 'Ledger of an account',
    description: 'Entries of one account, filterable by date, project, tag or party.',
    inputSchema: {
      account_id: ID, from: DATE.optional(), to: DATE.optional(), project_id: ID.optional(),
      tag_id: ID.optional(), party: z.string().max(100).optional(), page: z.number().int().positive().optional(),
    },
    annotations: RO,
  }, async (a) => j(() => getLedger(actor, {
    accountId: a.account_id, from: a.from ?? null, to: a.to ?? null, projectId: a.project_id ?? null,
    tagId: a.tag_id ?? null, party: a.party ?? null, page: a.page, perPage: 50,
  })));

  server.registerTool('payment_requests', {
    title: 'Payment requests',
    description: 'Members payment requests (pending|approved|rejected|paid), for finance managers.',
    inputSchema: { status: z.string().max(20).optional() },
    annotations: RO,
  }, async ({ status }) => j(() => listRequests(actor, status)));

  server.registerTool('recurring_payments', {
    title: 'Recurring payments',
    description: 'Recurring expenses/subscriptions and when they are due.',
    annotations: RO,
  }, async () => j(() => listRecurring(actor)));
}
