'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth';
import { ForbiddenError } from '@/domain/access/guard';
import { connectMailbox, disconnectMailbox, MailboxError, mailboxMessage } from '@/server/corp-mail/mailbox';

/** اتصالِ صندوقِ ایمیلِ شرکتیِ خودِ کاربر به برنامه (۲.۶۲.۰). */

export interface MailboxState { error?: string; ok?: boolean }

export async function connectMailboxAction(_prev: MailboxState, formData: FormData): Promise<MailboxState> {
  try {
    // ⚠️ requireActor «دیدن به‌جای کاربر» را رد می‌کند.
    await connectMailbox(await requireActor(), String(formData.get('password') ?? ''));
  } catch (error) {
    if (error instanceof MailboxError) return { error: mailboxMessage(error.code) };
    if (error instanceof ForbiddenError) return { error: mailboxMessage('view_only') };
    throw error;
  }
  revalidatePath('/mail');
  revalidatePath('/profile');
  return { ok: true };
}

export async function disconnectMailboxAction(): Promise<MailboxState> {
  try {
    await disconnectMailbox(await requireActor());
  } catch (error) {
    if (error instanceof MailboxError) return { error: mailboxMessage(error.code) };
    if (error instanceof ForbiddenError) return { error: mailboxMessage('view_only') };
    throw error;
  }
  revalidatePath('/mail');
  revalidatePath('/profile');
  return { ok: true };
}
