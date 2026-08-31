import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  projectClients, projectMembers, projects, taskRoles, tasks, userOffices, userRoles, users,
} from '@/db/schema';
import {
  commentAudience, newlyAssigned, reviewAudience, taskDoers,
} from '@/domain/notifications/recipients';

/**
 * تأمینِ گیرندگان از دیتابیس؛ تصمیم‌گیری در دامنه است
 * (`src/domain/notifications/recipients.ts`).
 *
 * ⚠️ همهٔ کوئری‌ها **مجموعه‌ای**اند، نه یکی به‌ازای هر نفر (R-PERF-01): این
 * توابع در مسیرِ داغِ ثبتِ کامنت و تغییرِ وضعیتِ تسک صدا زده می‌شوند.
 */

/** مالک و ادمین — پورتِ `manager_ids()`. */
export async function managerIds(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(userRoles.role, ['owner', 'admin']), isNull(users.deletedAt)));
  return rows.map((r) => r.id);
}

/**
 * مدیرانِ دفتری که پروژه مالِ آن است — پورتِ `office_managers_for_project()`.
 *
 * ⚠️ اینها لازم نیست روی پروژه امضا شده باشند؛ مسئولیتشان از دفتر می‌آید.
 */
export async function officeManagerIdsForProject(projectId: number): Promise<number[]> {
  const [project] = await db
    .select({ officeId: projects.officeId })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project?.officeId) return [];

  const rows = await db
    .select({ userId: userOffices.userId })
    .from(userOffices)
    .where(and(eq(userOffices.officeId, project.officeId), eq(userOffices.manages, true)));

  return [...new Set(rows.map((r) => r.userId))];
}

async function projectPeople(projectId: number) {
  const [members, clients] = await Promise.all([
    db.select({ userId: projectMembers.userId, roleTagId: projectMembers.roleTagId })
      .from(projectMembers).where(eq(projectMembers.projectId, projectId)),
    db.select({ userId: projectClients.userId })
      .from(projectClients).where(eq(projectClients.projectId, projectId)),
  ]);
  return { members, clientIds: clients.map((c) => c.userId) };
}

/** مخاطبِ کامنتِ تازه روی یک پروژه. */
export async function commentRecipients(projectId: number, authorId: number): Promise<number[]> {
  const [managers, officeManagers, people] = await Promise.all([
    managerIds(),
    officeManagerIdsForProject(projectId),
    projectPeople(projectId),
  ]);

  return commentAudience({
    managerIds: managers,
    officeManagerIds: officeManagers,
    memberIds: people.members.map((m) => m.userId),
    clientIds: people.clientIds,
    authorId,
  });
}

/** مخاطبِ «تسک به ریویو رفت». */
export async function reviewRecipients(projectId: number, actorId: number): Promise<number[]> {
  const [managers, officeManagers, people] = await Promise.all([
    managerIds(),
    officeManagerIdsForProject(projectId),
    projectPeople(projectId),
  ]);

  return reviewAudience({
    managerIds: managers,
    officeManagerIds: officeManagers,
    clientIds: people.clientIds,
    actorId,
  });
}

/** انجام‌دهندگانِ یک تسک — مسئولِ مستقیم، یا صاحبانِ نقش. */
export async function taskDoerIds(taskId: number): Promise<number[]> {
  const [task] = await db
    .select({
      projectId: tasks.projectId,
      assignedTo: tasks.assignedTo,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId));

  if (!task) return [];
  if (task.assignedTo) return [task.assignedTo];

  const [roles, people] = await Promise.all([
    db.select({ roleTagId: taskRoles.roleTagId, claimedBy: taskRoles.claimedBy })
      .from(taskRoles).where(eq(taskRoles.taskId, taskId)),
    projectPeople(task.projectId),
  ]);

  return taskDoers({ assignedTo: null, roles, members: people.members });
}

/** کسانی که با ویرایشِ تسک **تازه** مسئول شده‌اند. */
export function assignmentDelta(input: {
  after: readonly number[];
  before: readonly number[];
  editorId: number;
}): number[] {
  return newlyAssigned(input);
}
