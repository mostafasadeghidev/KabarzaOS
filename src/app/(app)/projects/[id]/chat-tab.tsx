'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Archive, ExternalLink, FolderKanban, MessagesSquare } from 'lucide-react';
import { createProjectGroupAction } from '../../messages/_form/actions';
import { ThreadPane } from '../../messages/thread-pane';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { PROJECT_GROUP_RETENTION_DAYS } from '@/domain/messaging/channels';

export interface ProjectChat {
  /** گروهِ موجود؛ `null` یعنی هنوز ساخته نشده. */
  threadId: number | null;
  unread: number;
  /** مدیر یا مدیرِ همین پروژه، و پروژه بایگانی نیست. */
  canCreate: boolean;
  archived: boolean;
  /** پولِ گفت‌وگوی زنده — همان تنظیمِ سامانه که صفحهٔ «پیام‌ها» می‌گیرد. */
  poll: { enabled: boolean; seconds: number };
}

/**
 * تبِ «گروهِ گفتگو» در صفحهٔ پروژه (۲.۳۳.۰) — خودِ گفتگو همین‌جا: پیام‌ها،
 * پولِ زنده، منشن و ارسال.
 *
 * ⚠️ همان `ThreadPane` ِ صفحهٔ «پیام‌ها» است، نه پیاده‌سازیِ دوم — پیش از این
 * این تب فقط لینک می‌داد تا یک گفتگو دو نسخه نداشته باشد؛ حالا یک کامپوننت در
 * دو جا. کارفرما این تب را اصلاً نمی‌گیرد (سرور برایش `null` می‌دهد).
 */
export function ChatTab({ projectId, chat, viewerId }: { projectId: number; chat: ProjectChat; viewerId: number }) {
  const t = useT();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  // گروهِ تازه‌ساخته همین‌جا باز می‌شود، نه با رفتن به صفحهٔ «پیام‌ها».
  const [threadId, setThreadId] = useState<number | null>(chat.threadId);

  const create = () => startTransition(async () => {
    const result = await createProjectGroupAction(projectId);
    if (result.error || !result.threadId) { show(t(result.error ?? 'گروه ساخته نشد.'), 'error'); return; }
    setThreadId(result.threadId);
  });

  if (threadId === null) {
    return (
      <div className="grid gap-4 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderKanban className="size-5" />
          </span>
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold">{t('گروهِ گفتگوی پروژه')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('گفتگوی داخلیِ تیمِ همین پروژه — اعضای پروژه، مدیرِ دفتر و مدیران. کارفرما آن را نمی‌بیند؛ گفتگوی رسمی با کارفرما در تبِ «کامنت‌ها» است.')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('پیامِ تازه در برنامه و تلگرام خبر می‌دهد (جمع‌شده، نه یکی‌یکی) و منشن با ایمیل هم می‌رسد. پیام‌ها {days} روز می‌مانند و با سبک‌سازی یا حذفِ پروژه پاک می‌شوند.', { days: PROJECT_GROUP_RETENTION_DAYS })}
            </p>
          </div>
        </div>
        {chat.archived && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Archive className="size-3.5" />
            {t('این پروژه بایگانی شده است؛ گروهش فقط‌خواندنی است.')}
          </p>
        )}
        <div>
          <Button onClick={create} disabled={pending}>
            {pending ? <Spinner /> : <MessagesSquare />}
            {t('ساختِ گروهِ گفتگو')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {/*
        ⚠️ ارتفاعِ ثابت، مثلِ صفحهٔ «پیام‌ها»: پیام‌ها خودشان اسکرول می‌خورند و
        کادرِ ارسال همیشه پیداست — نه اینکه گفتگوی بلند کلِ صفحه را دراز کند.
      */}
      <div className="flex h-[min(36rem,calc(100svh-12rem))] min-h-[24rem] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
        <ThreadPane
          threadId={threadId}
          viewerId={viewerId}
          poll={chat.poll}
          backButtonClass={null}
          showProjectLink={false}
          onClose={() => setThreadId(null)}
        />
      </div>
      <div className="flex justify-end">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href={`/messages/${threadId}`}>
            <ExternalLink />
            {t('باز کردن در «پیام‌ها»')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
