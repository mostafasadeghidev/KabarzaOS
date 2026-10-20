'use client';

import { useLayoutEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Archive, CircleCheck, ExternalLink, FolderKanban, MessagesSquare, Send } from 'lucide-react';
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
  /**
   * لینکِ عضویتِ گروهِ تلگرامِ پروژه (۲.۳۶.۰) — فقط برای کسی که حقِ عضویت دارد —
   * و وضعیتِ عضویتِ واقعی از تلگرام (۲.۴۳.۴).
   */
  telegramInvite: { link: string; connected: boolean; joined: boolean | null } | null;
}

/**
 * ارتفاعِ کادرِ گفتگو = از جای خودش تا پایینِ پنجره (۲.۴۳.۳)، تا کادرِ ارسال
 * بی اسکرول همان پایینِ صفحه دیده شود. ⚠️ فاصله از **بالای سند** سنجیده می‌شود،
 * نه از بالای پنجره، تا با اسکرولِ صفحه ارتفاع عوض نشود؛ `gapPx` همان پدینگِ پایینِ
 * `PageShell` است. کمینه ۲۰rem: روی
 * پنجرهٔ کوتاه کمی اسکرول بهتر از گفتگوی دوخطی است.
 */
function useFillViewport<T extends HTMLElement>(active: boolean, minPx = 320, gapPx = 32) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(minPx, Math.round(window.innerHeight - top - gapPx)));
    };
    measure();
    window.addEventListener('resize', measure);
    // بنرِ بالای صفحه (تایمر، تلگرام…) که دیرتر می‌آید جای کادر را جابه‌جا می‌کند.
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
    // ⚠️ `active`: کادر بعد از «ساختِ گروه» تازه به صفحه می‌آید.
  }, [active, minPx, gapPx]);
  return { ref, height };
}

/**
 * «پیوستن در تلگرام» — بالای تب، با گروهِ برنامه یا بی آن. ۲.۴۳.۴: کسی که از قبل
 * عضو است دعوت نمی‌بیند؛ کسی که تلگرامش وصل نیست می‌فهمد ربات او را نمی‌شناسد.
 */
function TelegramJoin({ invite }: { invite: ProjectChat['telegramInvite'] }) {
  const t = useT();
  if (!invite) return null;
  const joined = invite.joined === true;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {joined && <CircleCheck className="size-4 shrink-0 text-success" />}
        {joined
          ? t('شما عضوِ گروهِ تلگرامِ این پروژه هستید.')
          : invite.connected
            ? t('این پروژه گروهِ تلگرام هم دارد؛ ربات عضویتِ اعضای تیم را خودکار تأیید می‌کند.')
            : t('این پروژه گروهِ تلگرام هم دارد. اول تلگرامتان را در پروفایل وصل کنید؛ وگرنه ربات شما را نمی‌شناسد و درخواستِ عضویت رد می‌شود.')}
      </p>
      <Button asChild size="sm" variant="outline">
        {!joined && !invite.connected ? (
          <Link href="/profile">
            <Send />
            {t('وصلِ تلگرام')}
          </Link>
        ) : (
          <a href={invite.link} target="_blank" rel="noopener noreferrer">
            <Send />
            {joined ? t('باز کردنِ گروه') : t('پیوستن در تلگرام')}
          </a>
        )}
      </Button>
    </div>
  );
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
  const pane = useFillViewport<HTMLDivElement>(threadId !== null);

  const create = () => startTransition(async () => {
    const result = await createProjectGroupAction(projectId);
    if (result.error || !result.threadId) { show(t(result.error ?? 'گروه ساخته نشد.'), 'error'); return; }
    setThreadId(result.threadId);
  });

  if (threadId === null) {
    return (
      <div className="grid gap-3">
      <TelegramJoin invite={chat.telegramInvite} />
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
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <TelegramJoin invite={chat.telegramInvite} />
      {/* پیوندِ «پیام‌ها» بالای کادر (۲.۴۳.۳) — کادرِ ارسال آخرین چیزِ صفحه است. */}
      <div className="flex justify-end">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href={`/messages/${threadId}`}>
            <ExternalLink />
            {t('باز کردن در «پیام‌ها»')}
          </Link>
        </Button>
      </div>
      {/*
        ⚠️ ارتفاعِ محدود، مثلِ صفحهٔ «پیام‌ها»: پیام‌ها خودشان اسکرول می‌خورند و
        کادرِ ارسال همیشه پیداست — نه اینکه گفتگوی بلند کلِ صفحه را دراز کند.
        ارتفاع تا پایینِ پنجره (`useFillViewport`)؛ پیش از اندازه‌گیری همان قبلی.
      */}
      <div
        ref={pane.ref}
        style={pane.height !== null ? { height: pane.height } : undefined}
        className="flex h-[min(36rem,calc(100svh-12rem))] min-h-[20rem] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs"
      >
        <ThreadPane
          threadId={threadId}
          viewerId={viewerId}
          poll={chat.poll}
          backButtonClass={null}
          showProjectLink={false}
          onClose={() => setThreadId(null)}
        />
      </div>
    </div>
  );
}
