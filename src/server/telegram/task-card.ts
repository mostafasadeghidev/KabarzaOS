import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { attachments, files, projects, tags, tasks } from '@/db/schema';
import { tagName } from '@/db/tag-name';
import type { Locale } from '@/i18n/config';
import type { Translator } from '@/i18n/translate';

/**
 * کارتِ تسک برای اعلانِ تلگرام (۲.۱۲.۰) — عنوان، پروژه، اولویت، ددلاین،
 * توضیح، و فایل‌ها و پیوندهای خودِ تسک؛ تا کاربر بی‌بازکردنِ برنامه بداند چه
 * کاری به او سپرده شده.
 *
 * ⚠️ فقط برای اعلانِ «سپرده شد» (`task.assigned`) استفاده می‌شود که گیرنده‌اش
 * **انجام‌دهندهٔ همان تسک** است و همهٔ این‌ها را در برنامه هم می‌بیند. رسانهٔ
 * کامنت‌ها نمی‌آید — فقط پیوست‌های خودِ تسک.
 */

/** سقف‌ها — تلگرام عکس تا ۱۰ و فایل تا ۵۰ مگابایت می‌پذیرد؛ ما محتاط‌تریم. */
export const CARD_MAX_FILES = 5;
export const CARD_MAX_BYTES = 10 * 1024 * 1024;
const DESCRIPTION_MAX = 1500;

export interface TaskCardFile {
  storageKey: string;
  mime: string;
  name: string;
  size: number;
  /** عکس ← sendPhoto؛ بقیه ← sendDocument. */
  photo: boolean;
}

export interface TaskCard {
  lines: string[];
  files: TaskCardFile[];
}

const PHOTO = /^image\/(jpeg|png|webp)$/;

export async function taskCard(taskId: number, locale: Locale, tr: Translator): Promise<TaskCard | null> {
  const [row] = await db
    .select({
      title: tasks.title,
      description: tasks.description,
      dueDate: tasks.dueDate,
      project: projects.title,
      priority: tagName(locale),
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(tags, eq(tags.id, tasks.priorityTagId))
    .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)));
  if (!row) return null;

  const media = await db
    .select({
      kind: attachments.kind, url: attachments.externalUrl, label: attachments.label,
      storageKey: files.storageKey, mime: files.mime, size: files.size, name: files.originalName,
    })
    .from(attachments)
    .leftJoin(files, eq(files.id, attachments.fileId))
    // ⚠️ فقط پیوستِ خودِ تسک — رسانهٔ کامنت‌ها (commentId) جداست.
    .where(and(eq(attachments.taskId, taskId), isNull(attachments.commentId)))
    .orderBy(asc(attachments.id))
    .limit(20);

  const lines = [`📌 ${row.title}`, `📁 ${tr('پروژه')}: ${row.project}`];
  if (row.priority) lines.push(`⚡ ${tr('اولویت')}: ${row.priority}`);
  if (row.dueDate) lines.push(`📅 ${tr('ددلاین')}: ${row.dueDate}`);
  const description = row.description.trim();
  if (description) {
    lines.push('', `📝 ${description.length > DESCRIPTION_MAX ? `${description.slice(0, DESCRIPTION_MAX)}…` : description}`);
  }
  const links = media.filter((m) => m.kind === 'link' && m.url).map((m) => `🔗 ${m.label ? `${m.label}: ` : ''}${m.url}`);
  if (links.length > 0) lines.push('', ...links.slice(0, 10));

  const out: TaskCardFile[] = [];
  let skipped = 0;
  for (const m of media) {
    if (m.kind === 'link' || !m.storageKey || !m.mime) continue;
    if ((m.size ?? 0) > CARD_MAX_BYTES || out.length >= CARD_MAX_FILES) {
      skipped++;
      continue;
    }
    out.push({ storageKey: m.storageKey, mime: m.mime, name: m.name || 'file', size: m.size ?? 0, photo: PHOTO.test(m.mime) });
  }
  if (skipped > 0) lines.push('', `📎 ${tr('{n} فایلِ دیگر فقط در برنامه', { n: skipped })}`);
  return { lines, files: out };
}
