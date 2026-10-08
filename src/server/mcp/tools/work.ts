import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { REVIEW_SOURCES, users } from '@/db/schema';
import { parseInZone } from '@/i18n/datetime';
import {
  addTaskNote, applyQa, claimTask, getTaskDetail, referTask, toggleCommentStatus, toggleQaItem, updateTask,
} from '@/server/projects/service';
import { addReviewItem, createReview, getReview, updateReview } from '@/server/projects/reviews';
import { createProjectGroup, createChannel, reply, setThreadMuted } from '@/server/messaging/service';
import { markAllRead, markRead } from '@/server/notifications/service';
import { createMeeting, updateMeeting, listMeetings } from '@/server/meetings/service';
import { saveAbsence } from '@/server/availability/absence-service';
import { setWeek } from '@/server/availability/service';
import { addCustomTask, startOnboarding, toggleTask } from '@/server/onboarding/service';
import { addLink, setAttachmentPinned } from '@/server/files/service';
import { confirmPending, discardPending, resumePending, updateLog } from '@/server/timelogs/service';
import { saveNotifyPrefs, saveTimezone, updateMyProfile } from '@/server/people/profile-service';
import { DATE, ID, type Kit } from '../kit';

/**
 * نوشتن‌های روزمره (۲.۱۳.۰) — همهٔ کارهای غیرحساسی که کاربر در سایت می‌کند.
 *
 * ⚠️ هر ابزار همان سرویسِ اکشنِ سایت را صدا می‌زند (همان گارد، همان ممیزی).
 * ⚠️ بارگذاریِ فایل اینجا نیست — هوشِ مصنوعی فایل ندارد؛ پیوند هست.
 * ⚠️ حذف و پول و دسترسی و تنظیمات اینجا نیستند؛ آن‌ها در `sensitive.ts`.
 */

const TEXT = z.string().min(1).max(5000);
const LOCAL_TIME = z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/, 'Use YYYY-MM-DD HH:mm');

export function registerWork(kit: Kit) {
  const { server, actor, write, userZone } = kit;

  /* ---------------- تسک ---------------- */

  server.registerTool('update_task', {
    title: 'Edit a task',
    description: 'Change a task: title, description, status, priority, assignee, due date (YYYY-MM-DD, or "" to clear), private flag, dependency. Only given fields change. Ids from task_form_options.',
    inputSchema: {
      task_id: ID,
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      status_id: ID.nullable().optional(),
      priority_id: ID.nullable().optional(),
      assignee_user_id: ID.nullable().optional(),
      due_date: z.union([DATE, z.literal('')]).optional(),
      is_private: z.boolean().optional(),
      depends_on_task_id: ID.nullable().optional(),
    },
  }, async (a) => write('update_task', a, async () => {
    // ⚠️ سرویس فرمِ کامل می‌خواهد؛ آنچه داده نشده از خودِ تسک (با همان گاردِ دیدن) پر می‌شود.
    const { task, roles } = await getTaskDetail(actor, a.task_id);
    await updateTask(actor, a.task_id, {
      title: a.title ?? task.title,
      description: a.description ?? task.description,
      statusTagId: a.status_id !== undefined ? a.status_id : task.statusTagId,
      priorityTagId: a.priority_id !== undefined ? a.priority_id : task.priorityTagId,
      assignedTo: a.assignee_user_id !== undefined ? a.assignee_user_id : task.assignedTo,
      dueDate: a.due_date !== undefined ? (a.due_date || null) : task.dueDate,
      isPrivate: a.is_private ?? task.isPrivate,
      dependsOn: a.depends_on_task_id !== undefined ? a.depends_on_task_id : task.dependsOn,
      roleTagIds: roles.map((r) => r.roleTagId).filter((x): x is number => x !== null),
      clientHidden: task.clientHidden,
    });
    return { updated: true };
  }));

  server.registerTool('refer_task', {
    title: 'Refer a task to someone',
    description: 'Hand a task to another person on the project with a note (project managers).',
    inputSchema: { task_id: ID, to_user_id: ID, note: z.string().max(1000).default('') },
  }, async (a) => write('refer_task', a, async () => {
    await referTask(actor, a.task_id, a.to_user_id, a.note);
    return { referred: true };
  }));

  server.registerTool('claim_task', {
    title: 'Claim a role task',
    description: 'Take a role task ("I\'ll do it") that has no assignee yet.',
    inputSchema: { task_id: ID },
  }, async (a) => write('claim_task', a, async () => {
    await claimTask(actor, a.task_id);
    return { claimed: true };
  }));

  server.registerTool('add_task_note', {
    title: 'Add a note to a task',
    description: 'Write in a task\'s own conversation (not the project comments).',
    inputSchema: { task_id: ID, text: TEXT },
  }, async (a) => write('add_task_note', a, async () => {
    await addTaskNote(actor, a.task_id, a.text);
    return { posted: true };
  }));

  server.registerTool('toggle_comment_done', {
    title: 'Mark a comment done / open',
    description: 'Toggle a project comment between open and resolved.',
    inputSchema: { comment_id: ID },
  }, async (a) => write('toggle_comment_done', a, async () => {
    await toggleCommentStatus(actor, a.comment_id);
    return { toggled: true };
  }));

  /* ---------------- QA و بازبینی ---------------- */

  server.registerTool('apply_qa', {
    title: 'Apply QA checklist',
    description: 'Add the QA library checklist to a project for given role ids and/or "client".',
    inputSchema: { project_id: ID, audiences: z.array(z.union([ID, z.literal('client')])).min(1) },
  }, async (a) => write('apply_qa', a, async () => {
    await applyQa(actor, a.project_id, a.audiences);
    return { applied: true };
  }));

  server.registerTool('toggle_qa_item', {
    title: 'Tick / untick a QA item',
    description: 'Toggle one QA checklist item (ids from get_qa).',
    inputSchema: { qa_id: ID },
  }, async (a) => write('toggle_qa_item', a, async () => {
    await toggleQaItem(actor, a.qa_id);
    return { toggled: true };
  }));

  const reviewFields = {
    title: z.string().min(1).max(200),
    video_url: z.string().max(1000).default(''),
    source: z.enum(REVIEW_SOURCES).nullable().default(null),
    notes: z.string().max(5000).default(''),
    role_ids: z.array(ID).default([]),
    client_visible: z.boolean().default(false),
  };

  server.registerTool('create_review', {
    title: 'Create a review round',
    description: 'Start a review (e.g. a video or site review) on a project.',
    inputSchema: { project_id: ID, ...reviewFields },
  }, async (a) => write('create_review', a, async () => {
    const id = await createReview(actor, a.project_id, {
      title: a.title, videoUrl: a.video_url, source: a.source, notes: a.notes, roleTagIds: a.role_ids, clientVisible: a.client_visible,
    });
    return { created: true, reviewId: id };
  }));

  server.registerTool('update_review', {
    title: 'Edit a review round',
    description: 'Change a review\'s title, link, notes, roles or client visibility.',
    inputSchema: { review_id: ID, ...reviewFields },
  }, async (a) => write('update_review', a, async () => {
    await getReview(actor, a.review_id);
    await updateReview(actor, a.review_id, {
      title: a.title, videoUrl: a.video_url, source: a.source, notes: a.notes, roleTagIds: a.role_ids, clientVisible: a.client_visible,
    });
    return { updated: true };
  }));

  server.registerTool('add_review_item', {
    title: 'Add a review item',
    description: 'Add an item (a fix to do) to a review; it becomes a task. Optional video start/end seconds and site area.',
    inputSchema: {
      review_id: ID, title: z.string().min(1).max(200), description: z.string().max(5000).default(''),
      status_id: ID.nullable().default(null), priority_id: ID.nullable().default(null),
      assignee_user_id: ID.nullable().default(null), role_ids: z.array(ID).default([]),
      due_date: DATE.nullable().default(null),
      start_seconds: z.number().int().min(0).nullable().default(null), end_seconds: z.number().int().min(0).nullable().default(null),
      area: z.string().max(100).default(''), client_hidden: z.boolean().default(false),
    },
  }, async (a) => write('add_review_item', a, async () => {
    const id = await addReviewItem(actor, a.review_id, {
      title: a.title, description: a.description, statusTagId: a.status_id, priorityTagId: a.priority_id,
      assignedTo: a.assignee_user_id, dueDate: a.due_date, isPrivate: false, roleTagIds: a.role_ids,
      start: a.start_seconds, end: a.end_seconds, area: a.area, clientHidden: a.client_hidden,
    });
    return { created: true, taskId: id };
  }));

  /* ---------------- فایل و پیوند ---------------- */

  server.registerTool('add_project_link', {
    title: 'Add a link to project files',
    description: 'Add a link (Figma, Drive, …) to a project\'s Files tab.',
    inputSchema: { project_id: ID, url: z.string().url().max(2000), label: z.string().max(200).default('') },
  }, async (a) => write('add_project_link', a, async () => {
    await addLink(actor, a.project_id, a.url, a.label);
    return { added: true };
  }));

  server.registerTool('pin_file', {
    title: 'Pin / unpin a project file',
    description: 'Pin a file or link to the top of the Files tab (project managers).',
    inputSchema: { attachment_id: ID, pinned: z.boolean() },
  }, async (a) => write('pin_file', a, async () => {
    await setAttachmentPinned(actor, a.attachment_id, a.pinned);
    return { pinned: a.pinned };
  }));

  /* ---------------- پیام و اعلان ---------------- */

  server.registerTool('reply_message', {
    title: 'Reply in a conversation',
    description: 'Reply in an existing conversation (ids from list_inbox).',
    inputSchema: { thread_id: ID, text: TEXT },
  }, async (a) => write('reply_message', a, async () => {
    await reply(actor, a.thread_id, a.text);
    return { sent: true };
  }));

  server.registerTool('mute_conversation', {
    title: 'Mute / unmute a conversation',
    description: 'Mute or unmute notifications of a group or channel.',
    inputSchema: { thread_id: ID, muted: z.boolean() },
  }, async (a) => write('mute_conversation', a, async () => {
    await setThreadMuted(actor, a.thread_id, a.muted);
    return { muted: a.muted };
  }));

  server.registerTool('create_channel', {
    title: 'Create a team channel',
    description: 'Managers: create a channel for everyone, a role (role tag id) or an office.',
    inputSchema: {
      title: z.string().min(1).max(100),
      audience: z.enum(['all', 'role', 'office']),
      role_id: ID.optional(),
      office_id: ID.optional(),
      allow_reply: z.boolean().default(true),
      first_message: z.string().max(5000).optional(),
    },
  }, async (a) => write('create_channel', a, async () => {
    const audience = a.audience === 'role' ? { type: a.audience, tagId: a.role_id }
      : a.audience === 'office' ? { type: a.audience, officeId: a.office_id } : { type: a.audience };
    const id = await createChannel(actor, { title: a.title, audience, allowReply: a.allow_reply, body: a.first_message });
    return { created: true, threadId: id };
  }));

  server.registerTool('create_project_group', {
    title: 'Create project group chat',
    description: 'Create (or open) the group conversation of a project (project managers).',
    inputSchema: { project_id: ID },
  }, async (a) => write('create_project_group', a, async () => ({ threadId: await createProjectGroup(actor, a.project_id) })));

  server.registerTool('mark_notification_read', {
    title: 'Mark notification read',
    description: 'Mark one notification as read, or all of them with all=true.',
    inputSchema: { notification_id: ID.optional(), all: z.boolean().optional() },
  }, async (a) => write('mark_notification_read', a, async () => {
    if (a.all) await markAllRead(actor);
    else if (a.notification_id) await markRead(actor, a.notification_id);
    return { done: true };
  }));

  /* ---------------- جلسه ---------------- */

  const meetingFields = {
    title: z.string().min(1).max(200),
    description: z.string().max(5000).default(''),
    at: LOCAL_TIME,
    location: z.string().max(300).default(''),
    project_id: ID.nullable().default(null),
    office_id: ID.nullable().default(null),
    attendee_ids: z.array(ID).default([]),
  };
  const toMeeting = async (a: { title: string; description: string; at: string; location: string; project_id: number | null; office_id: number | null; attendee_ids: number[] }) => {
    const when = parseInZone(a.at, await userZone());
    if (!when) throw new Error('bad time');
    return {
      title: a.title, description: a.description, meetAt: when, location: a.location,
      projectId: a.project_id, officeId: a.office_id, attendeeIds: a.attendee_ids,
    };
  };

  server.registerTool('create_meeting', {
    title: 'Create a meeting',
    description: 'Create a meeting (local time YYYY-MM-DD HH:mm) for a project or an office, with attendees from meeting_candidates.',
    inputSchema: meetingFields,
  }, async (a) => write('create_meeting', a, async () => ({ created: true, meetingId: await createMeeting(actor, await toMeeting(a)) })));

  server.registerTool('update_meeting', {
    title: 'Edit a meeting',
    description: 'Change a meeting I can edit (all fields are set again).',
    inputSchema: { meeting_id: ID, ...meetingFields },
  }, async (a) => write('update_meeting', a, async () => {
    const mine = (await listMeetings(actor)).meetings.find((m) => m.id === a.meeting_id);
    if (!mine) return { updated: false, error: 'Not found.' };
    await updateMeeting(actor, a.meeting_id, await toMeeting(a));
    return { updated: true };
  }));

  /* ---------------- حضور و مرخصی ---------------- */

  server.registerTool('record_leave', {
    title: 'Record leave',
    description: 'Record a leave period for myself or someone I manage (leave_targets).',
    inputSchema: { user_id: ID.optional(), from: DATE, to: DATE, note: z.string().max(500).optional() },
  }, async (a) => write('record_leave', a, async () => ({
    saved: true, id: await saveAbsence(actor, { userId: a.user_id ?? actor.id, from: a.from, to: a.to, note: a.note }),
  })));

  server.registerTool('set_weekly_schedule', {
    title: 'Set weekly availability',
    description: 'Set the weekly schedule: days 0 = Saturday … 6 = Friday, each with HH:MM time slots. For myself, or a member if I manage members.',
    inputSchema: {
      user_id: ID.optional(),
      days: z.array(z.object({
        day: z.number().int().min(0).max(6),
        slots: z.array(z.object({ from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) })).default([]),
      })),
    },
  }, async (a) => write('set_weekly_schedule', a, async () => {
    const slots: Record<number, Array<{ from: string; to: string }>> = {};
    for (const d of a.days) slots[d.day] = d.slots;
    await setWeek(actor, a.user_id ?? actor.id, a.days.map((d) => d.day), slots);
    return { saved: true };
  }));

  /* ---------------- آنبوردینگ ---------------- */

  server.registerTool('onboarding_toggle', {
    title: 'Tick an onboarding task',
    description: 'Mark an onboarding task done or not done (ids from onboarding_detail).',
    inputSchema: { task_id: ID, done: z.boolean() },
  }, async (a) => write('onboarding_toggle', a, async () => {
    await toggleTask(actor, a.task_id, a.done);
    return { done: a.done };
  }));

  server.registerTool('onboarding_start', {
    title: 'Start / sync onboarding',
    description: 'Start onboarding for a person, or sync it with the library (member managers).',
    inputSchema: { user_id: ID },
  }, async (a) => write('onboarding_start', a, async () => startOnboarding(actor, a.user_id)));

  server.registerTool('onboarding_add_task', {
    title: 'Add a custom onboarding task',
    description: 'Add a custom task to a person\'s onboarding (member managers).',
    inputSchema: {
      user_id: ID, title: z.string().min(1).max(200), description: z.string().max(2000).default(''),
      assignee_user_id: ID.nullable().default(null), due_date: z.union([DATE, z.literal('')]).default(''),
      link: z.string().max(2000).default(''),
    },
  }, async (a) => write('onboarding_add_task', a, async () => ({
    created: true,
    id: await addCustomTask(actor, a.user_id, {
      title: a.title, description: a.description, kind: 'custom', assigneeUserId: a.assignee_user_id,
      serviceId: null, dueDate: a.due_date, link: a.link,
    }),
  })));

  /* ---------------- ساعت ---------------- */

  server.registerTool('update_time_log', {
    title: 'Edit a time entry',
    description: 'Change one of my time entries (ids from list_time_logs); only within the edit window.',
    inputSchema: {
      log_id: ID, hours: z.number().int().min(0).max(24), minutes: z.number().int().min(0).max(59),
      description: z.string().max(500).default(''), date: DATE.optional(), project_id: ID.nullable().optional(),
    },
  }, async (a) => write('update_time_log', a, async () => {
    await updateLog(actor, a.log_id, {
      minutes: a.hours * 60 + a.minutes, description: a.description,
      ...(a.date ? { logDate: a.date } : {}), ...(a.project_id !== undefined ? { projectId: a.project_id } : {}),
    });
    return { updated: true };
  }));

  server.registerTool('resolve_long_timer', {
    title: 'Resolve a parked long timer',
    description: 'A timer that ran too long waits for a decision: confirm with the real minutes, resume it, or discard it.',
    inputSchema: { action: z.enum(['confirm', 'resume', 'discard']), minutes: z.number().int().min(0).max(1440).optional() },
  }, async (a) => write('resolve_long_timer', a, async () => {
    if (a.action === 'confirm') await confirmPending(actor, a.minutes ?? 0);
    else if (a.action === 'resume') await resumePending(actor);
    else await discardPending(actor);
    return { done: a.action };
  }));

  /* ---------------- پروفایلِ خودم ---------------- */

  server.registerTool('update_my_profile', {
    title: 'Edit my profile',
    description: 'Change my name, email or phone (only given fields).',
    inputSchema: { name: z.string().max(100).optional(), email: z.string().email().optional(), phone: z.string().max(40).optional() },
  }, async (a) => write('update_my_profile', a, async () => {
    const [me] = await db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, actor.id));
    await updateMyProfile(actor, { name: a.name ?? me!.name, email: a.email ?? me!.email, phone: a.phone ?? me!.phone });
    return { updated: true };
  }));

  server.registerTool('set_my_timezone', {
    title: 'Set my timezone',
    description: 'Set my timezone (IANA name like Asia/Tehran), or "" for the system default.',
    inputSchema: { timezone: z.string().max(60) },
  }, async (a) => write('set_my_timezone', a, async () => {
    await saveTimezone(actor, a.timezone);
    return { saved: true };
  }));

  server.registerTool('set_notification_prefs', {
    title: 'Notification preferences',
    description: 'Email and Telegram notification switches; muted email categories: tasks, projects, finance, meetings, messages.',
    inputSchema: { email: z.string().max(200).default(''), email_on: z.boolean(), telegram_on: z.boolean(), muted: z.array(z.string().max(30)).default([]) },
  }, async (a) => write('set_notification_prefs', a, async () => {
    await saveNotifyPrefs(actor, { email: a.email, emailOn: a.email_on, muted: a.muted, telegramOn: a.telegram_on });
    return { saved: true };
  }));
}
