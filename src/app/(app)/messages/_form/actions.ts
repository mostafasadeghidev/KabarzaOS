'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import {
  compose, contactManagement, createChannel, createProjectGroup, deleteGroupMessage, deleteThread,
  leaveThread, openThread, RateLimitedError, reply, resolveAudience, setThreadMuted, ThreadNotFoundError,
} from '@/server/messaging/service';
import { ForbiddenError } from '@/domain/access/guard';
import type { Audience } from '@/domain/messaging/threads';
import { CHANNEL_MESSAGES, ChannelError } from '@/domain/messaging/channels';
import { getT } from '@/i18n/server';

/** اقدام‌های پیام‌ها. گاردها همه در سرویس‌اند (R-ARCH-01). */

export interface MessageState {
  error?: string;
  ok?: boolean;
  /** تعدادِ گفتگوهای ساخته‌شده — با پخشِ همگانی بیش از یکی. */
  created?: number;
}

/** خطاهای سرویس را به پیامِ فارسیِ روشن تبدیل می‌کند. */
async function explain(error: unknown, fallback: string): Promise<string> {
  const t = await getT();
  if (error instanceof RateLimitedError) {
    return t('کمی صبر کنید — تا ارسالِ بعدی {n} ثانیه مانده.', { n: error.secondsLeft });
  }
  if (error instanceof ThreadNotFoundError) return 'این گفتگو در دسترس نیست.';
  if (error instanceof ChannelError) return CHANNEL_MESSAGES[error.code];
  if (error instanceof ForbiddenError) {
    if (error.required === 'thread.group_leave') return 'از گروه نمی‌شود بیرون رفت؛ می‌توانید بی‌صدایش کنید.';
    if (error.required === 'messages.channel') return 'ساختِ کانال فقط از مدیر ممکن است.';
    if (error.required === 'messages.project_group') return 'گروهِ پروژه را مدیر یا مدیرِ همان پروژه می‌سازد.';
    if (error.required === 'message.delete') return 'فقط نویسندهٔ پیام یا مدیر می‌تواند آن را حذف کند.';
    if (error.required === 'message.empty') return 'متنِ پیام خالی است.';
    if (error.required === 'message.no_recipients') return 'مخاطبی برای ارسال نیست.';
    if (error.required === 'thread.no_reply') return 'این یک اعلانِ یک‌طرفه است و امکان پاسخ ندارد.';
    if (error.required === 'messages.broadcast') return 'ارسالِ همگانی فقط از مدیر ممکن است.';
    if (error.required === 'thread.delete') return 'فقط سازندهٔ گفتگو یا مدیر می‌تواند آن را حذف کند.';
    return 'اجازهٔ ارسالِ پیام ندارید.';
  }
  return fallback;
}

export async function composeAction(_prev: MessageState, formData: FormData): Promise<MessageState> {
  const body = String(formData.get('body') ?? '');
  const allowReply = formData.get('allowReply') !== null;
  const audience = String(formData.get('audience') ?? '');

  const recipientIds = formData.getAll('recipients')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  try {
    const actor = await requireActor();

    // مخاطبِ آماده («همهٔ اعضا») گیرنده‌ها را از سرور می‌گیرد، نه از فرم —
    // تا فهرستِ فرستاده‌شده قابلِ دست‌کاری نباشد.
    const finalRecipients = audience
      ? await resolveAudience(actor, audience as Audience)
      : recipientIds;

    const created = await compose(actor, { recipientIds: finalRecipients, body, allowReply });
    revalidatePath('/messages');
    return { ok: true, created: created.length };
  } catch (error) {
    return { error: await explain(error, 'پیام ارسال نشد.') };
  }
}

/**
 * «پیام به مدیریت» — یک رشتهٔ مشترک با همهٔ مدیران.
 * ⚠️ گیرنده انتخاب نمی‌شود؛ همین نکتهٔ اصلیِ این قابلیت است.
 */
export async function contactManagementAction(
  _prev: MessageState,
  formData: FormData,
): Promise<MessageState> {
  try {
    const actor = await requireActor();
    await contactManagement(actor, String(formData.get('body') ?? ''));
    revalidatePath('/messages');
    return { ok: true, created: 1 };
  } catch (error) {
    return { error: await explain(error, 'پیام ارسال نشد.') };
  }
}

export async function replyAction(_prev: MessageState, formData: FormData): Promise<MessageState> {
  const threadId = Number(formData.get('threadId'));
  const body = String(formData.get('body') ?? '');
  if (!Number.isInteger(threadId) || threadId <= 0) return { error: 'گفتگو معتبر نیست.' };

  try {
    const actor = await requireActor();
    await reply(actor, threadId, body);
    revalidatePath('/messages');
    return { ok: true };
  } catch (error) {
    return { error: await explain(error, 'پاسخ ارسال نشد.') };
  }
}

export async function openThreadAction(threadId: number) {
  const actor = await requireActor();
  return openThread(actor, threadId);
}

export async function leaveThreadAction(threadId: number): Promise<MessageState> {
  try {
    const actor = await requireActor();
    await leaveThread(actor, threadId);
    revalidatePath('/messages');
    return { ok: true };
  } catch (error) {
    return { error: await explain(error, 'گفتگو حذف نشد.') };
  }
}

/** حذفِ کلِ گفتگو برای همه — سازنده یا مدیر (R-MSG-11). */
export async function deleteThreadAction(threadId: number): Promise<MessageState> {
  try {
    const actor = await requireActor();
    await deleteThread(actor, threadId);
    revalidatePath('/messages');
    return { ok: true };
  } catch (error) {
    return { error: await explain(error, 'گفتگو حذف نشد.') };
  }
}

/* ---- کانالِ تیم و گروهِ پروژه ---- */

export interface ChannelState extends MessageState {
  /** گفتگوی ساخته‌شده — تا همان باز شود. */
  threadId?: number;
}

/** کانالِ تازه — مخاطب از فرم می‌آید ولی سرور خودش می‌سنجد. */
export async function createChannelAction(_prev: ChannelState, formData: FormData): Promise<ChannelState> {
  const type = String(formData.get('audienceType') ?? 'all');
  const audience = type === 'role'
    ? { type, tagId: Number(formData.get('roleTagId')) }
    : type === 'office' ? { type, officeId: Number(formData.get('officeId')) } : { type: 'all' };
  try {
    const actor = await requireActor();
    const threadId = await createChannel(actor, {
      title: String(formData.get('title') ?? ''),
      audience,
      // «فقط اعلان» یعنی فقط مدیر می‌نویسد.
      allowReply: formData.get('announceOnly') === null,
      body: String(formData.get('body') ?? ''),
    });
    revalidatePath('/messages');
    return { ok: true, threadId };
  } catch (error) {
    return { error: await explain(error, 'کانال ساخته نشد.') };
  }
}

/** گروهِ گفتگوی پروژه — از صفحهٔ همان پروژه. */
export async function createProjectGroupAction(projectId: number): Promise<ChannelState> {
  try {
    const actor = await requireActor();
    const threadId = await createProjectGroup(actor, projectId);
    revalidatePath('/messages');
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, threadId };
  } catch (error) {
    return { error: await explain(error, 'گروه ساخته نشد.') };
  }
}

export async function setMutedAction(threadId: number, muted: boolean): Promise<MessageState> {
  try {
    const actor = await requireActor();
    await setThreadMuted(actor, threadId, muted);
    revalidatePath('/messages');
    return { ok: true };
  } catch (error) {
    return { error: await explain(error, 'تغییر ذخیره نشد.') };
  }
}

export async function deleteGroupMessageAction(messageId: number): Promise<MessageState> {
  try {
    const actor = await requireActor();
    await deleteGroupMessage(actor, messageId);
    revalidatePath('/messages');
    return { ok: true };
  } catch (error) {
    return { error: await explain(error, 'پیام حذف نشد.') };
  }
}
