import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { projects } from '@/db/schema';
import { ForbiddenError } from '@/domain/access/guard';
import { INTERVAL_UNITS } from '@/domain/finance/recurring';
import {
  addProjectClient, addProjectMember, approveBid, createProject, deleteComment, deleteProject,
  deleteQaItem as deleteProjectQaItem, deleteTask, getProjectTabs, removeProjectMember, removeQaRole,
  setArchived, setClients, setProjectAccess, setProjectStatus, submitBid, updateProject, withdrawBid,
} from '@/server/projects/service';
import { deleteReview } from '@/server/projects/reviews';
import { deleteAttachment } from '@/server/files/service';
import { deleteMeeting } from '@/server/meetings/service';
import { deleteGroupMessage, deleteThread, leaveThread } from '@/server/messaging/service';
import { deleteAbsence } from '@/server/activity/service';
import { deleteLog } from '@/server/timelogs/service';
import { deleteTask as deleteOnboardingTask } from '@/server/onboarding/service';
import {
  addUnitEntry, cancelRequest, createRequest, deleteUnitEntry, requestForUnit,
} from '@/server/finance/member-service';
import {
  closePeriod, createEntry, deleteAccount, deleteEntry, reopenPeriod, saveAccount, transfer, updateEntry,
} from '@/server/finance/service';
import {
  decideRequest, deleteRecurring, payRecurring, payRequest, payUnit, saveRecurring,
} from '@/server/finance/payouts';
import {
  createPerson, grantStaffRole, removePerson, revokeStaffRole, setMemberState, setUserAccess, updatePerson,
} from '@/server/people/service';
import { deleteService, grantAccess, revokeAccess, saveService } from '@/server/access/service';
import {
  deleteCurrency, deleteOffice, deleteQaItem as deleteLibraryQaItem, deleteRate, deleteTag, deleteVendor,
  saveCurrency, saveOffice, saveQaItem, saveRate, saveTag, saveVendor, setDefaultCurrency,
} from '@/server/settings/service';
import { saveSystemConfig } from '@/server/settings/system-service';
import { saveCompany } from '@/server/people/profile-service';
import { dispatchReport, getReportConfig, previewReport } from '@/server/scheduler/daily-report';
import { reportDate } from '@/domain/scheduler/daily-report';
import { DATE, ID, type Kit } from '../kit';

/**
 * کارهای حساس (۲.۱۳.۰) — پول، حذف، افراد و دسترسی‌ها، تنظیماتِ پروژه و سامانه.
 *
 * ⚠️ فقط وقتی ثبت می‌شوند که کاربر **صریحاً** اجازهٔ «همه، حتی کارهای حساس» داده
 * باشد (دامنهٔ `sensitive` ِ توکن/اتصالِ وب، یا کلیدِ «اجازهٔ کارهای حساس» برای
 * ربات). بی آن مدل اصلاً این ابزارها را نمی‌بیند.
 * ⚠️ همه `destructiveHint` دارند: ربات تلگرام پیش از اجرا با هشدارِ پررنگ «بله/خیر»
 * می‌گیرد و هر فراخوان با برچسبِ حساس در «رویدادها» ثبت می‌شود.
 * ⚠️ گاردِ اصلی همچنان خودِ سرویس است: این دامنه فقط **اجازه می‌دهد بپرسی**؛ کسی که
 * در سایت حقِ پرداخت ندارد اینجا هم ندارد.
 * ⚠️ عمداً نیست: رمزِ عبور، اطلاعاتِ بانکی، توکنِ ربات و وب‌هوک‌ها، بارگذاریِ فایل.
 */

const MONEY = z.string().regex(/^-?\d+(\.\d+)?$/, 'A plain number like 1500000 or 12.5');
const DANGER = { destructiveHint: true } as const;

export function registerSensitive(kit: Kit) {
  if (!kit.sensitiveAllowed) return;
  const { server, actor, sensitive } = kit;
  const owner = () => { if (!actor.roles.includes('owner')) throw new ForbiddenError('owner'); };

  /* ---------------- حذف‌ها ---------------- */

  const del = (name: string, title: string, description: string, idName: string, fn: (id: number) => Promise<unknown>) => {
    server.registerTool(name, {
      title, description, inputSchema: { [idName]: ID }, annotations: DANGER,
    }, async (a: Record<string, number>) => sensitive(name, a, async () => {
      await fn(a[idName]!);
      return { deleted: true };
    }));
  };
  del('delete_task', 'Delete a task', 'Delete a task (project managers).', 'task_id', (id) => deleteTask(actor, id));
  del('delete_comment', 'Delete a project comment', 'Delete a comment from a project.', 'comment_id', (id) => deleteComment(actor, id));
  del('delete_project_file', 'Delete a project file/link', 'Delete a file or link from a project.', 'attachment_id', (id) => deleteAttachment(actor, id));
  del('delete_review', 'Delete a review round', 'Delete a review round.', 'review_id', (id) => deleteReview(actor, id));
  del('delete_meeting', 'Delete a meeting', 'Delete a meeting I can edit.', 'meeting_id', (id) => deleteMeeting(actor, id));
  del('delete_conversation', 'Delete a conversation', 'Delete a conversation (its creator or a manager).', 'thread_id', (id) => deleteThread(actor, id));
  del('leave_conversation', 'Leave a conversation', 'Remove a conversation from my inbox.', 'thread_id', (id) => leaveThread(actor, id));
  del('delete_group_message', 'Delete a group message', 'Delete a message in a group (its author or a manager).', 'message_id', (id) => deleteGroupMessage(actor, id));
  del('delete_leave', 'Delete a leave period', 'Delete a recorded leave period.', 'leave_id', (id) => deleteAbsence(actor, id));
  del('delete_time_log', 'Delete a time entry', 'Delete one of my time entries.', 'log_id', (id) => deleteLog(actor, id));
  del('delete_onboarding_task', 'Delete an onboarding task', 'Delete a task from someone\'s onboarding.', 'task_id', (id) => deleteOnboardingTask(actor, id));
  del('delete_qa_item', 'Delete a QA checklist item', 'Delete one item from a project\'s QA checklist.', 'qa_id', (id) => deleteProjectQaItem(actor, id));

  /* ---------------- پروژه ---------------- */

  const projectFields = {
    title: z.string().min(1).max(200),
    description: z.string().max(10000),
    reg_date: DATE.nullable(),
    deadline: DATE.nullable(),
    status_id: ID.nullable(),
    price: MONEY,
    currency_id: ID.nullable(),
    office_id: ID.nullable(),
    parent_id: ID.nullable(),
    unit_based: z.boolean(),
    tender: z.boolean(),
    scope: z.enum(['company', 'private']),
  };

  server.registerTool('create_project', {
    title: 'Create a project',
    description: 'Create a project (price as a plain number, scope company|private). Add members with add_project_member.',
    inputSchema: {
      ...projectFields,
      description: projectFields.description.default(''), reg_date: projectFields.reg_date.default(null),
      deadline: projectFields.deadline.default(null), status_id: projectFields.status_id.default(null),
      price: projectFields.price.default('0'), currency_id: projectFields.currency_id.default(null),
      office_id: projectFields.office_id.default(null), parent_id: projectFields.parent_id.default(null),
      unit_based: projectFields.unit_based.default(false), tender: projectFields.tender.default(false),
      scope: projectFields.scope.default('company'),
    },
    annotations: DANGER,
  }, async (a) => sensitive('create_project', a, async () => ({
    created: true,
    projectId: await createProject(actor, {
      title: a.title, description: a.description, regDate: a.reg_date, deadline: a.deadline, statusTagId: a.status_id,
      price: a.price, currencyId: a.currency_id, officeId: a.office_id, parentId: a.parent_id,
      isUnitBased: a.unit_based, isTender: a.tender, scope: a.scope,
    }),
  })));

  server.registerTool('update_project', {
    title: 'Edit a project',
    description: 'Change a project\'s fields; only the given fields change (project managers).',
    inputSchema: { project_id: ID, ...Object.fromEntries(Object.entries(projectFields).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof projectFields]: z.ZodOptional<(typeof projectFields)[K]> } },
    annotations: DANGER,
  }, async (a) => sensitive('update_project', a, async () => {
    // ⚠️ اول گاردِ دیدن (همان صفحهٔ پروژه)، بعد مقدارِ خامِ فیلدهای داده‌نشده —
    // نه مقدارِ ماسک‌شدهٔ صفحه؛ وگرنه قیمتِ پنهان با رشتهٔ خالی پاک می‌شد.
    await getProjectTabs(actor, a.project_id);
    const [p] = await db.select().from(projects).where(eq(projects.id, a.project_id));
    if (!p) return { updated: false, error: 'Not found.' };
    await updateProject(actor, a.project_id, {
      title: a.title ?? p.title,
      description: a.description ?? p.description,
      regDate: a.reg_date !== undefined ? a.reg_date : p.regDate,
      deadline: a.deadline !== undefined ? a.deadline : p.deadline,
      statusTagId: a.status_id !== undefined ? a.status_id : p.statusTagId,
      price: a.price ?? String(p.price ?? '0'),
      currencyId: a.currency_id !== undefined ? a.currency_id : p.currencyId,
      officeId: a.office_id !== undefined ? a.office_id : p.officeId,
      parentId: a.parent_id !== undefined ? a.parent_id : p.parentId,
      isUnitBased: a.unit_based ?? p.isUnitBased,
      isTender: a.tender ?? p.isTender,
      scope: a.scope ?? (p.scope as 'company' | 'private'),
    });
    return { updated: true };
  }));

  server.registerTool('set_project_status', {
    title: 'Change project status',
    description: 'Set a project\'s status (status ids from list_task_statuses are task statuses; project statuses come from get_project_full).',
    inputSchema: { project_id: ID, status_id: ID.nullable() },
    annotations: DANGER,
  }, async (a) => sensitive('set_project_status', a, async () => {
    await setProjectStatus(actor, a.project_id, a.status_id);
    return { changed: true };
  }));

  server.registerTool('archive_project', {
    title: 'Archive / unarchive a project',
    description: 'Archive or restore a project.',
    inputSchema: { project_id: ID, archived: z.boolean() },
    annotations: DANGER,
  }, async (a) => sensitive('archive_project', a, async () => {
    await setArchived(actor, a.project_id, a.archived);
    return { archived: a.archived };
  }));

  server.registerTool('delete_project', {
    title: 'Delete a project',
    description: 'Delete a project (owner only). confirm_title must be the exact project title. mode: full (everything) or detach (keep money records).',
    inputSchema: { project_id: ID, confirm_title: z.string().min(1), mode: z.enum(['full', 'detach']).default('detach') },
    annotations: DANGER,
  }, async (a) => sensitive('delete_project', a, async () => {
    await deleteProject(actor, a.project_id, { mode: a.mode, confirmTitle: a.confirm_title });
    return { deleted: true };
  }));

  server.registerTool('add_project_member', {
    title: 'Add a member to a project',
    description: 'Add a person to a project with a role and agreed amount (plain number).',
    inputSchema: {
      project_id: ID, user_id: ID, role_id: ID.nullable().default(null), agreed_amount: MONEY.default('0'),
      unit_rate: MONEY.nullable().default(null), currency_id: ID.nullable().default(null),
    },
    annotations: DANGER,
  }, async (a) => sensitive('add_project_member', a, async () => {
    await addProjectMember(actor, a.project_id, {
      userId: a.user_id, roleTagId: a.role_id, agreedAmount: a.agreed_amount, unitRate: a.unit_rate, currencyId: a.currency_id,
    });
    return { added: true };
  }));

  server.registerTool('remove_project_member', {
    title: 'Remove a member from a project',
    description: 'Remove a membership row (member row id from get_project_full members).',
    inputSchema: { project_id: ID, member_row_id: ID },
    annotations: DANGER,
  }, async (a) => sensitive('remove_project_member', a, async () => {
    await removeProjectMember(actor, a.project_id, a.member_row_id);
    return { removed: true };
  }));

  server.registerTool('set_project_access', {
    title: 'Block / unblock someone on a project',
    description: 'Cut (or restore) a member\'s or client\'s access to one project without removing them.',
    inputSchema: { project_id: ID, user_id: ID, blocked: z.boolean() },
    annotations: DANGER,
  }, async (a) => sensitive('set_project_access', a, async () => {
    await setProjectAccess(actor, a.project_id, a.user_id, a.blocked);
    return { blocked: a.blocked };
  }));

  server.registerTool('set_project_clients', {
    title: 'Set project clients',
    description: 'Add one client, or replace the whole client list of a project.',
    inputSchema: { project_id: ID, add_user_id: ID.optional(), set_user_ids: z.array(ID).optional() },
    annotations: DANGER,
  }, async (a) => sensitive('set_project_clients', a, async () => {
    if (a.set_user_ids) await setClients(actor, a.project_id, a.set_user_ids);
    else if (a.add_user_id) await addProjectClient(actor, a.project_id, a.add_user_id);
    return { saved: true };
  }));

  server.registerTool('remove_qa_role', {
    title: 'Remove a QA audience',
    description: 'Remove all QA items of one role (or the client checklist with role_id null) from a project.',
    inputSchema: { project_id: ID, role_id: ID.nullable() },
    annotations: DANGER,
  }, async (a) => sensitive('remove_qa_role', a, async () => ({ removed: await removeQaRole(actor, a.project_id, a.role_id) })));

  server.registerTool('tender_bid', {
    title: 'Tender bids',
    description: 'submit (bidder: my price for a role), approve or withdraw (project managers: a bid id).',
    inputSchema: {
      action: z.enum(['submit', 'approve', 'withdraw']), project_id: ID.optional(), role_id: ID.optional(),
      amount: MONEY.optional(), note: z.string().max(1000).default(''), bid_id: ID.optional(),
    },
    annotations: DANGER,
  }, async (a) => sensitive('tender_bid', a, async () => {
    if (a.action === 'submit') {
      if (!a.project_id || !a.role_id || !a.amount) return { error: 'project_id, role_id and amount are required' };
      await submitBid(actor, { projectId: a.project_id, roleTagId: a.role_id, amount: a.amount, note: a.note });
    } else if (a.bid_id) {
      if (a.action === 'approve') await approveBid(actor, a.bid_id); else await withdrawBid(actor, a.bid_id);
    } else return { error: 'bid_id is required' };
    return { done: a.action };
  }));

  /* ---------------- پولِ پروژه (اعضا) ---------------- */

  server.registerTool('project_units', {
    title: 'Unit work entries on a project',
    description: 'For unit-based projects: add a unit entry (quantity), delete one, or request payment for one.',
    inputSchema: {
      action: z.enum(['add', 'delete', 'request']), project_id: ID.optional(), user_id: ID.optional(),
      date: DATE.optional(), quantity: z.number().positive().optional(), note: z.string().max(500).default(''), entry_id: ID.optional(),
    },
    annotations: DANGER,
  }, async (a) => sensitive('project_units', a, async () => {
    if (a.action === 'add') {
      if (!a.project_id || !a.date || !a.quantity) return { error: 'project_id, date and quantity are required' };
      return { id: await addUnitEntry(actor, { projectId: a.project_id, userId: a.user_id ?? actor.id, entryDate: a.date, quantity: a.quantity, note: a.note }) };
    }
    if (!a.entry_id) return { error: 'entry_id is required' };
    if (a.action === 'delete') await deleteUnitEntry(actor, a.entry_id);
    else await requestForUnit(actor, a.entry_id);
    return { done: a.action };
  }));

  server.registerTool('my_payment_request', {
    title: 'My payment request on a project',
    description: 'Ask to be paid on a project (amount as plain number), or cancel a request.',
    inputSchema: { action: z.enum(['create', 'cancel']), project_id: ID.optional(), amount: MONEY.optional(), note: z.string().max(1000).default(''), request_id: ID.optional() },
    annotations: DANGER,
  }, async (a) => sensitive('my_payment_request', a, async () => {
    if (a.action === 'create') {
      if (!a.project_id || !a.amount) return { error: 'project_id and amount are required' };
      return { id: await createRequest(actor, { projectId: a.project_id, amount: a.amount, note: a.note }) };
    }
    if (!a.request_id) return { error: 'request_id is required' };
    await cancelRequest(actor, a.request_id);
    return { cancelled: true };
  }));

  /* ---------------- مالی ---------------- */

  const entryFields = {
    account_id: ID, date: DATE, direction: z.enum(['in', 'out']), amount: MONEY, currency_id: ID,
    description: z.string().max(2000).default(''), project_id: ID.nullable().default(null), tag_ids: z.array(ID).default([]),
    office_id: ID.nullable().default(null), payer_user_id: ID.nullable().default(null), payer_label: z.string().max(200).default(''),
    receiver_user_id: ID.nullable().default(null), receiver_label: z.string().max(200).default(''),
  };
  type EntryArgs = { [K in keyof typeof entryFields]: z.infer<(typeof entryFields)[K]> };
  const toEntry = (a: EntryArgs) => ({
    accountId: a.account_id, entryDate: a.date, direction: a.direction, amount: a.amount, currencyId: a.currency_id,
    description: a.description, projectId: a.project_id, tagIds: a.tag_ids, officeId: a.office_id,
    payerUserId: a.payer_user_id, payerLabel: a.payer_label, receiverUserId: a.receiver_user_id, receiverLabel: a.receiver_label,
  });

  server.registerTool('create_ledger_entry', {
    title: 'Record income or expense',
    description: 'Add a ledger entry to an account (direction in|out, plain-number amount). Ids from finance_accounts.',
    inputSchema: entryFields,
    annotations: DANGER,
  }, async (a) => sensitive('create_ledger_entry', a, async () => ({ created: true, entryId: await createEntry(actor, toEntry(a)) })));

  server.registerTool('update_ledger_entry', {
    title: 'Edit a ledger entry',
    description: 'Replace a ledger entry\'s fields (all fields are set again).',
    inputSchema: { entry_id: ID, ...entryFields },
    annotations: DANGER,
  }, async (a) => sensitive('update_ledger_entry', a, async () => {
    await updateEntry(actor, a.entry_id, toEntry(a));
    return { updated: true };
  }));

  server.registerTool('delete_ledger_entry', {
    title: 'Delete a ledger entry',
    description: 'Delete a ledger entry (not in a closed period).',
    inputSchema: { entry_id: ID },
    annotations: DANGER,
  }, async (a) => sensitive('delete_ledger_entry', a, async () => {
    await deleteEntry(actor, a.entry_id);
    return { deleted: true };
  }));

  server.registerTool('transfer_money', {
    title: 'Transfer between accounts',
    description: 'Move money between two accounts (amounts as plain numbers; differ when currencies differ).',
    inputSchema: { from_account_id: ID, to_account_id: ID, from_amount: MONEY, to_amount: MONEY, date: DATE, description: z.string().max(1000).default('') },
    annotations: DANGER,
  }, async (a) => sensitive('transfer_money', a, async () => ({
    transferred: true,
    entries: await transfer(actor, { fromAccountId: a.from_account_id, toAccountId: a.to_account_id, fromAmount: a.from_amount, toAmount: a.to_amount, entryDate: a.date, description: a.description }),
  })));

  server.registerTool('decide_payment_request', {
    title: 'Approve / reject a payment request',
    description: 'Owner: approve or reject a member\'s payment request.',
    inputSchema: { request_id: ID, decision: z.enum(['approved', 'rejected']), note: z.string().max(1000).default('') },
    annotations: DANGER,
  }, async (a) => sensitive('decide_payment_request', a, async () => {
    await decideRequest(actor, a.request_id, a.decision, a.note);
    return { decided: a.decision };
  }));

  server.registerTool('pay', {
    title: 'Pay a request or unit entry',
    description: 'Finance: pay an approved payment request or a unit entry from an account (amount optional = full).',
    inputSchema: { what: z.enum(['request', 'unit']), id: ID, account_id: ID, date: DATE, amount: MONEY.nullable().default(null) },
    annotations: DANGER,
  }, async (a) => sensitive('pay', a, async () => {
    const input = { accountId: a.account_id, entryDate: a.date, amount: a.amount };
    if (a.what === 'request') await payRequest(actor, a.id, input); else await payUnit(actor, a.id, input);
    return { paid: true };
  }));

  server.registerTool('recurring_payment', {
    title: 'Recurring payments',
    description: 'save (create when recurring_id is missing), pay (the due instance) or delete a recurring/one-time expense.',
    inputSchema: {
      action: z.enum(['save', 'pay', 'delete']), recurring_id: ID.optional(), title: z.string().max(200).optional(),
      amount: MONEY.optional(), currency_id: ID.optional(), kind: z.enum(['recurring', 'once']).default('recurring'),
      interval_unit: z.enum(INTERVAL_UNITS).default('month'), interval_count: z.number().int().min(1).max(36).default(1),
      start_date: DATE.optional(), next_due_date: DATE.optional(), account_id: ID.nullable().default(null),
      vendor_name: z.string().max(200).default(''), category_id: ID.nullable().default(null), note: z.string().max(1000).default(''),
      active: z.boolean().default(true), expected_due: DATE.nullable().default(null),
    },
    annotations: DANGER,
  }, async (a) => sensitive('recurring_payment', a, async () => {
    if (a.action === 'delete' || a.action === 'pay') {
      if (!a.recurring_id) return { error: 'recurring_id is required' };
      if (a.action === 'delete') await deleteRecurring(actor, a.recurring_id);
      else await payRecurring(actor, a.recurring_id, a.expected_due);
      return { done: a.action };
    }
    if (!a.title || !a.amount || !a.currency_id || !a.start_date) return { error: 'title, amount, currency_id and start_date are required' };
    return {
      saved: true,
      id: await saveRecurring(actor, {
        id: a.recurring_id ?? null, title: a.title, amount: a.amount, currencyId: a.currency_id, kind: a.kind,
        intervalUnit: a.interval_unit, intervalCount: a.interval_count, startDate: a.start_date,
        nextDueDate: a.next_due_date ?? a.start_date, accountId: a.account_id, vendorId: null, vendorName: a.vendor_name,
        categoryTagId: a.category_id, note: a.note, isActive: a.active,
      }),
    };
  }));

  server.registerTool('finance_account', {
    title: 'Create / edit / delete a finance account',
    description: 'save (create when account_id is missing) or delete an account.',
    inputSchema: {
      action: z.enum(['save', 'delete']), account_id: ID.optional(), name: z.string().max(200).optional(),
      account_kind: z.enum(['business', 'personal']).default('business'), office_id: ID.nullable().default(null),
      currency_id: ID.nullable().default(null), opening_balance: MONEY.default('0'), note: z.string().max(1000).default(''),
      sort_order: z.number().int().default(0), active: z.boolean().default(true), scope: z.enum(['company', 'private']).default('company'),
      accountant_ids: z.array(ID).default([]),
    },
    annotations: DANGER,
  }, async (a) => sensitive('finance_account', a, async () => {
    if (a.action === 'delete') {
      if (!a.account_id) return { error: 'account_id is required' };
      await deleteAccount(actor, a.account_id);
      return { deleted: true };
    }
    if (!a.name) return { error: 'name is required' };
    return {
      saved: true,
      id: await saveAccount(actor, {
        id: a.account_id ?? null, name: a.name, type: a.account_kind, officeId: a.office_id, currencyId: a.currency_id,
        openingBalance: a.opening_balance, note: a.note, sortOrder: a.sort_order, isActive: a.active, scope: a.scope,
        accountantIds: a.accountant_ids,
      }),
    };
  }));

  server.registerTool('fiscal_period', {
    title: 'Close / reopen the fiscal period',
    description: 'Owner: close the books up to a date, or reopen the last closed period.',
    inputSchema: { action: z.enum(['close', 'reopen']), close_date: DATE.optional() },
    annotations: DANGER,
  }, async (a) => sensitive('fiscal_period', a, async () => {
    if (a.action === 'reopen') await reopenPeriod(actor);
    else if (a.close_date) await closePeriod(actor, a.close_date);
    else return { error: 'close_date is required' };
    return { done: a.action };
  }));

  /* ---------------- افراد و دسترسی ---------------- */

  const personFields = {
    name: z.string().min(1).max(100), email: z.string().email(), phone: z.string().max(40).default(''),
    username: z.string().max(60).optional(), tag_ids: z.array(ID).default([]), office_ids: z.array(ID).default([]),
    managed_office_ids: z.array(ID).nullable().default(null), private_access: z.boolean().default(false),
  };
  const toPerson = (a: { name: string; email: string; phone: string; username?: string; tag_ids: number[]; office_ids: number[]; managed_office_ids: number[] | null; private_access: boolean }) => ({
    name: a.name, email: a.email, phone: a.phone, username: a.username, tagIds: a.tag_ids, officeIds: a.office_ids,
    managedOfficeIds: a.managed_office_ids, privateAccess: a.private_access,
  });

  server.registerTool('create_person', {
    title: 'Add a member or client',
    description: 'Create a member or client account (no password is set here; they get an invite or set it themselves).',
    inputSchema: { role: z.enum(['member', 'client']), ...personFields },
    annotations: DANGER,
  }, async (a) => sensitive('create_person', a, async () => ({ created: true, userId: await createPerson(actor, a.role, toPerson(a)) })));

  server.registerTool('update_person', {
    title: 'Edit a member or client',
    description: 'Replace a person\'s name, email, phone, role tags, offices and private access.',
    inputSchema: { user_id: ID, ...personFields },
    annotations: DANGER,
  }, async (a) => sensitive('update_person', a, async () => {
    await updatePerson(actor, a.user_id, toPerson(a));
    return { updated: true };
  }));

  server.registerTool('set_member_state', {
    title: 'Activate / offboard / lock a person',
    description: 'Set a person\'s state: active, finance (offboarded, money only) or locked.',
    inputSchema: { user_id: ID, state: z.enum(['active', 'finance', 'locked']) },
    annotations: DANGER,
  }, async (a) => sensitive('set_member_state', a, async () => {
    await setMemberState(actor, a.user_id, a.state);
    return { state: a.state };
  }));

  server.registerTool('remove_person', {
    title: 'Remove a member or client',
    description: 'Remove a person\'s member or client role (history is kept where needed).',
    inputSchema: { user_id: ID, role: z.enum(['member', 'client']) },
    annotations: DANGER,
  }, async (a) => sensitive('remove_person', a, async () => removePerson(actor, a.user_id, a.role)));

  server.registerTool('staff_access', {
    title: 'Staff admin access',
    description: 'Owner: make someone staff (or not), and set their per-section access levels and visible report tabs.',
    inputSchema: {
      user_id: ID, staff: z.boolean().optional(),
      levels: z.record(z.string(), z.string()).optional(), visible_tabs: z.array(z.string()).optional(),
    },
    annotations: DANGER,
  }, async (a) => sensitive('staff_access', a, async () => {
    if (a.staff === true) await grantStaffRole(actor, a.user_id);
    if (a.staff === false) await revokeStaffRole(actor, a.user_id);
    if (a.levels) await setUserAccess(actor, a.user_id, { levels: a.levels, visibleTabs: a.visible_tabs ?? [] });
    return { saved: true };
  }));

  server.registerTool('access_register', {
    title: 'Access register',
    description: 'Services and who has access: save_service (create when service_id is missing), delete_service, grant (a person to a service), revoke (a grant id). No passwords are ever stored.',
    inputSchema: {
      action: z.enum(['save_service', 'delete_service', 'grant', 'revoke']), service_id: ID.optional(),
      name: z.string().max(200).optional(), category_id: ID.nullable().default(null), owner_user_id: ID.nullable().default(null),
      admin_url: z.string().max(2000).default(''), note: z.string().max(2000).default(''), active: z.boolean().default(true),
      user_id: ID.optional(), account_ref: z.string().max(200).default(''), level: z.string().max(60).default(''), grant_id: ID.optional(),
    },
    annotations: DANGER,
  }, async (a) => sensitive('access_register', a, async () => {
    switch (a.action) {
      case 'save_service':
        if (!a.name) return { error: 'name is required' };
        return { saved: true, result: await saveService(actor, { id: a.service_id ?? null, name: a.name, categoryTagId: a.category_id, ownerUserId: a.owner_user_id, adminUrl: a.admin_url, note: a.note, isActive: a.active }) };
      case 'delete_service':
        if (!a.service_id) return { error: 'service_id is required' };
        return { result: await deleteService(actor, a.service_id) };
      case 'grant':
        if (!a.service_id || !a.user_id) return { error: 'service_id and user_id are required' };
        // ⚠️ `vaultRef` (جای رمز در گاوصندوق) از هوشِ مصنوعی پذیرفته نمی‌شود.
        return { granted: true, result: await grantAccess(actor, { serviceId: a.service_id, userId: a.user_id, accountRef: a.account_ref, level: a.level, vaultRef: '', note: a.note }) };
      case 'revoke':
        if (!a.grant_id) return { error: 'grant_id is required' };
        await revokeAccess(actor, a.grant_id);
        return { revoked: true };
    }
  }));

  /* ---------------- تنظیمات ---------------- */

  server.registerTool('settings_catalog', {
    title: 'Settings catalogs',
    description: 'Create/edit (id missing = create) or delete items of: currency, rate, tag, office, vendor, qa_library. Fields depend on the kind; see the parameter names.',
    inputSchema: {
      kind: z.enum(['currency', 'rate', 'tag', 'office', 'vendor', 'qa_library']),
      action: z.enum(['save', 'delete', 'set_default']),
      id: ID.optional(), name: z.string().max(200).optional(), code: z.string().max(10).optional(), symbol: z.string().max(10).optional(),
      decimals: z.number().int().min(0).max(6).optional(), active: z.boolean().default(true),
      from_currency_id: ID.optional(), to_currency_id: ID.optional(), rate: MONEY.optional(), effective_date: DATE.optional(),
      tag_type: z.string().max(40).optional(), color: z.string().max(20).default(''), status_group: z.string().max(30).default(''),
      is_review: z.boolean().default(false), is_closed: z.boolean().default(false), sort_order: z.number().int().default(0),
      location: z.string().max(200).default(''), default_currency_id: ID.nullable().default(null), note: z.string().max(1000).default(''),
      description: z.string().max(2000).default(''), role_id: ID.nullable().default(null), is_task: z.boolean().default(true),
    },
    annotations: DANGER,
  }, async (a) => sensitive('settings_catalog', a, async () => {
    const need = (ok: unknown, what: string) => { if (!ok) throw new Error(`${what} is required`); };
    if (a.action === 'delete') {
      if (a.kind === 'rate') { need(a.from_currency_id && a.to_currency_id, 'from/to currency'); await deleteRate(actor, a.from_currency_id!, a.to_currency_id!); return { deleted: true }; }
      need(a.id, 'id');
      const id = a.id!;
      if (a.kind === 'currency') await deleteCurrency(actor, id);
      else if (a.kind === 'tag') await deleteTag(actor, id);
      else if (a.kind === 'office') await deleteOffice(actor, id);
      else if (a.kind === 'vendor') await deleteVendor(actor, id);
      else await deleteLibraryQaItem(actor, id);
      return { deleted: true };
    }
    if (a.action === 'set_default') {
      need(a.kind === 'currency' && a.id, 'currency id');
      await setDefaultCurrency(actor, a.id!);
      return { done: true };
    }
    switch (a.kind) {
      case 'currency':
        need(a.code && a.name, 'code and name');
        return { result: await saveCurrency(actor, { id: a.id ?? null, code: a.code!, name: a.name!, symbol: a.symbol ?? '', decimals: a.decimals ?? 0, isActive: a.active }) };
      case 'rate':
        need(a.from_currency_id && a.to_currency_id && a.rate && a.effective_date, 'from/to currency, rate and effective_date');
        return { result: await saveRate(actor, { fromCurrencyId: a.from_currency_id!, toCurrencyId: a.to_currency_id!, rate: a.rate!, effectiveDate: a.effective_date! }) };
      case 'tag':
        need(a.name && a.tag_type, 'name and tag_type');
        return { result: await saveTag(actor, { id: a.id ?? null, name: a.name!, ...{ ['type']: a.tag_type! }, color: a.color, statusGroup: a.status_group, isReview: a.is_review, isClosed: a.is_closed, sortOrder: a.sort_order }) };
      case 'office':
        need(a.name, 'name');
        return { result: await saveOffice(actor, { id: a.id ?? null, name: a.name!, location: a.location, defaultCurrencyId: a.default_currency_id, isActive: a.active }) };
      case 'vendor':
        need(a.name, 'name');
        return { result: await saveVendor(actor, { id: a.id ?? null, name: a.name!, note: a.note, isActive: a.active }) };
      case 'qa_library':
        need(a.name, 'name (the item title)');
        return { result: await saveQaItem(actor, { id: a.id ?? null, title: a.name!, description: a.description, roleTagId: a.role_id, isTask: a.is_task, sortOrder: a.sort_order }) };
    }
  }));

  server.registerTool('system_settings', {
    title: 'System settings',
    description: 'Change system settings: brandName, defaultLocale, weekStart (0 = Saturday), timezone, presence and polling options, msgPurgeDays. Only the given keys change.',
    inputSchema: { settings: z.record(z.string(), z.unknown()) },
    annotations: DANGER,
  }, async (a) => sensitive('system_settings', a, async () => ({ saved: await saveSystemConfig(actor, a.settings) })));

  server.registerTool('company_info', {
    title: 'Company information',
    description: 'Set the company details used on invoices.',
    inputSchema: {
      name: z.string().max(200), address: z.string().max(1000).default(''), tax_id: z.string().max(60).default(''),
      email: z.string().max(200).default(''), phone: z.string().max(60).default(''), website: z.string().max(300).default(''),
      bank: z.string().max(1000).default(''), invoice_footer: z.string().max(2000).default(''),
    },
    annotations: DANGER,
  }, async (a) => sensitive('company_info', a, async () => {
    await saveCompany(actor, { name: a.name, address: a.address, taxId: a.tax_id, email: a.email, phone: a.phone, website: a.website, bank: a.bank, invoiceFooter: a.invoice_footer });
    return { saved: true };
  }));

  server.registerTool('daily_report', {
    title: 'Daily report',
    description: 'Owner: preview today\'s daily report text, or send it now to its configured destinations.',
    inputSchema: { action: z.enum(['preview', 'send']) },
    annotations: DANGER,
  }, async (a) => sensitive('daily_report', a, async () => {
    owner();
    const config = await getReportConfig();
    const date = reportDate(new Date().toISOString().slice(0, 10), config.offset);
    if (a.action === 'preview') return { date, text: await previewReport(date) };
    return { date, sent: await dispatchReport(date) };
  }));
}
