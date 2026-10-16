'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Archive, Bell, BellOff, Check, CheckCheck, FolderKanban, Hash, Megaphone, Trash2 } from 'lucide-react';
import {
  deleteGroupMessageAction, deleteThreadAction, leaveThreadAction,
  openThreadAction, replyAction, setMutedAction, type MessageState,
} from './_form/actions';
import { GroupComposer, MessageBody, SendButton } from './group-parts';
import { monogram } from '@/domain/files/monogram';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PresenceBadge } from '@/components/presence';
import { DefaultAvatar } from '@/components/default-avatar';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Marker, MarkerContent } from '@/components/ui/marker';
import {
  Message, MessageAvatar, MessageContent, MessageFooter, MessageGroup, MessageHeader,
} from '@/components/ui/message';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { submitOnModEnter, useModEnterLabel } from '@/lib/submit-shortcut';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { cn } from '@/lib/utils';
import { Hint } from '@/components/ui/tooltip';

/**
 * قابِ یک گفتگو — سربرگ، پیام‌ها، پولِ زنده و کادرِ پاسخ (۲.۳۳.۰).
 *
 * ⚠️ چرا جدا: صفحهٔ «پیام‌ها» و تبِ «گروهِ گفتگو» ِ پروژه هر دو همین را
 * می‌کشند. پیش از این تبِ پروژه فقط به صفحهٔ پیام‌ها لینک می‌داد، چون یک گفتگو
 * با دو پیاده‌سازی یعنی هر بهبودی دو بار و یکی همیشه عقب؛ حالا یک پیاده‌سازی،
 * دو جا.
 */

export type Thread = Awaited<ReturnType<typeof openThreadAction>>;
type ThreadMessage = Thread['messages'][number];

/**
 * آواتارِ گفتگو — تک‌نگارِ رنگی روی `Avatar` ِ shadcn.
 *
 * ⚠️ رنگ فقط از **برچسب** ساخته می‌شود، نه از شناسهٔ کاربر: برچسب سمتِ سرور
 * ماسک می‌شود (R-MSG-03) و همهٔ مدیران «مدیریت»اند. اگر رنگ از شناسهٔ واقعی
 * می‌آمد، دو «مدیریت» با دو رنگ از هم تشخیص داده می‌شدند و ماسک بی‌اثر می‌شد.
 */
export function ChatAvatar({ label, userId, size = 'default' }: {
  label: string;
  /**
   * شناسه‌ای که عکسش آمدنی است — سرور فقط وقتی می‌دهد که برچسب ماسک نشده
   * (`personAvatarId`). عکس نبود، همان تک‌نگارِ برچسب می‌ماند.
   */
  userId?: number | null;
  size?: 'sm' | 'default' | 'lg';
}) {
  const { letter, background } = monogram(0, label || '—');
  return (
    <Avatar size={size}>
      {userId ? <AvatarImage src={`/api/users/${userId}/avatar`} alt="" className="object-cover" /> : null}
      {/*
        شخص بی‌عکس ← آواتارِ پیش‌فرض (۲.۵.۰)؛ کانال و «مدیریت» (بی‌شناسه) همان حرفِ رنگی.
        اگر تصویرِ پیش‌فرض بار نشد، باز همان حرف.
      */}
      {userId ? (
        <AvatarFallback className="bg-muted" delayMs={150}>
          <DefaultAvatar
            fallback={(
              <span className="flex size-full items-center justify-center rounded-full font-semibold text-white" style={{ background }}>
                {letter}
              </span>
            )}
          />
        </AvatarFallback>
      ) : (
        <AvatarFallback className="font-semibold text-white" style={{ background }}>
          {letter}
        </AvatarFallback>
      )}
      {userId ? <PresenceBadge userId={userId} /> : null}
    </Avatar>
  );
}

/** نشانِ گروه به‌جای آواتار — # برای کانالِ تیم، پوشه برای گروهِ پروژه. */
export function GroupIcon({ kind, size = 'lg' }: { kind: 'channel' | 'project'; size?: 'default' | 'lg' }) {
  const Icon = kind === 'channel' ? Hash : FolderKanban;
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary',
        size === 'lg' ? 'size-10' : 'size-8',
      )}
    >
      <Icon className={size === 'lg' ? 'size-5' : 'size-4'} />
    </span>
  );
}

/**
 * تکه‌های گفتگو: جداکنندهٔ روز + دسته‌های پیاپیِ یک فرستنده.
 *
 * ⚠️ دسته‌بندی فقط نمایشی است: نامِ فرستنده سرِ دسته و آواتار تهِ دسته می‌آید
 * (الگوی `MessageGroup` ِ shadcn)، ولی هر پیام ساعت و تیکِ خودش را نگه می‌دارد
 * — رسیدِ خواندن به‌ازای هر پیام است (R-MSG-07) و نباید در دسته گم شود.
 */
type Block =
  | { kind: 'day'; key: string; day: string }
  | { kind: 'group'; key: string; fromUserId: number; fromName: string; fromAvatarId: number | null; items: ThreadMessage[] };

function toBlocks(messages: ThreadMessage[], tz: string): Block[] {
  const blocks: Block[] = [];
  let day = '';
  for (const m of messages) {
    const d = formatDateTime(m.createdAt, tz).slice(0, 10);
    if (d !== day) {
      day = d;
      blocks.push({ kind: 'day', key: `d${d}`, day: d });
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === 'group' && last.fromUserId === m.fromUserId) last.items.push(m);
    else blocks.push({ kind: 'group', key: `g${m.id}`, fromUserId: m.fromUserId, fromName: m.fromName ?? '—', fromAvatarId: m.fromAvatarId ?? null, items: [m] });
  }
  return blocks;
}

export function ThreadPane({
  threadId,
  viewerId,
  poll,
  onClose,
  backButtonClass = '@3xl/main:hidden',
  showProjectLink = true,
}: {
  threadId: number;
  /** خودِ بیننده — پیام‌های او سمتِ دیگر می‌نشینند و تیکِ خواندن می‌گیرند. */
  viewerId: number;
  /** پولِ گفت‌وگوی زنده — از تنظیماتِ سامانه. */
  poll: { enabled: boolean; seconds: number };
  /** بستنِ گفتگو (دکمهٔ برگشت، پس از حذف، یا گفتگوی باز‌نشدنی). */
  onClose?: () => void;
  /** کلاسِ دکمهٔ برگشت؛ `null` = بی‌دکمه (مثلاً در تبِ پروژه). */
  backButtonClass?: string | null;
  /** لینکِ «صفحهٔ پروژه» در سربرگِ گروهِ پروژه — در خودِ صفحهٔ پروژه بی‌معناست. */
  showProjectLink?: boolean;
}) {
  const tr = useT();
  const sendKeys = useModEnterLabel();
  const tz = useTimeZone();
  const { show } = useToast();
  const confirm = useConfirm();
  const [thread, setThread] = useState<Thread | null>(null);
  const [pending, startTransition] = useTransition();
  const [replyState, replyFormAction] = useActionState<MessageState, FormData>(replyAction, {});

  useEffect(() => {
    let alive = true;
    openThreadAction(threadId)
      .then((t) => { if (alive) setThread(t); })
      .catch(() => {
        show(tr('این گفتگو در دسترس نیست.'), 'error');
        // ⚠️ گفتگوی باز‌نشدنی بسته می‌شود؛ وگرنه قابِ گفتگو در حالتِ بارگذاری می‌ماند.
        if (alive) onClose?.();
      });
    return () => { alive = false; };
  }, [threadId, replyState]);

  /**
   * گفت‌وگوی زنده — پورتِ پولِ `admin-messages.js`.
   *
   * ⚠️ سه شرطِ خاموشی، و هر سه لازم‌اند:
   *  · تنظیمِ سامانه خاموش باشد (سرور هم همین را چک می‌کند)،
   *  · گفت‌وگویی باز نباشد،
   *  · تب پنهان باشد — پولِ تبِ پنهان فقط سرور را گرم می‌کند.
   *
   * ⚠️ اثرانگشت در `ref` نگه داشته می‌شود، نه در state: گذاشتنش در state
   * افکت را دوباره راه می‌انداخت و تایمر هر بار از نو ساخته می‌شد.
   */
  const fpRef = useRef('');
  useEffect(() => {
    if (!poll.enabled) return;
    fpRef.current = '';
    let alive = true;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(
          `/api/messages/poll?thread=${threadId}&fp=${encodeURIComponent(fpRef.current)}`,
        );
        if (!res.ok) return;
        const data = await res.json() as {
          changed: boolean; fingerprint?: string; messages?: Thread['messages']; readUpTo?: number;
          mentionNames?: Record<number, string>;
        };
        if (!alive) return;
        if (data.fingerprint) fpRef.current = data.fingerprint;
        if (data.changed && data.messages) {
          setThread((cur) => (cur
            ? {
              ...cur,
              messages: data.messages!,
              readUpTo: data.readUpTo ?? cur.readUpTo,
              mentionNames: { ...cur.mentionNames, ...data.mentionNames },
            }
            : cur));
        }
      } catch { /* شبکهٔ قطع نباید چیزی را بشکند؛ تیکِ بعدی دوباره تلاش می‌کند. */ }
    };

    void tick();
    const timer = setInterval(() => { void tick(); }, Math.max(3, poll.seconds) * 1000);
    const onVisible = () => { if (!document.hidden) void tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [threadId, poll.enabled, poll.seconds]);

  // ---- گفتگو: پیمایش تا آخرین پیام ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<number | null>(null);
  const [atEnd, setAtEnd] = useState(true);
  const lastMessageId = thread ? thread.messages[thread.messages.length - 1]?.id ?? null : null;

  /**
   * ⚠️ با بازشدنِ گفتگو همیشه ته، ولی با پیامِ تازه فقط اگر کاربر همان
   * پایین است — کسی که بالا رفته تا پیامِ قدیمی را بخواند نباید پرت شود.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !thread) return;
    const switched = scrolledFor.current !== thread.thread.id;
    const nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (switched || nearEnd) el.scrollTop = el.scrollHeight;
    scrolledFor.current = thread.thread.id;
    setAtEnd(true);
  }, [thread?.thread.id, lastMessageId]);

  const scrollToEnd = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const blocks = useMemo(() => (thread ? toBlocks(thread.messages, tz) : []), [thread, tz]);
  const today = formatDateTime(new Date(), tz).slice(0, 10);
  const yesterday = formatDateTime(new Date(Date.now() - 86_400_000), tz).slice(0, 10);
  const dayLabel = (day: string) =>
    day === today ? tr('امروز') : day === yesterday ? tr('دیروز') : day;

  /**
   * ⚠️ دو معنا، دو دکمه (R-MSG-11): سازنده/مدیر گفتگو را برای **همه** حذف
   * می‌کند؛ گیرندهٔ عادی فقط از صندوقِ **خودش** کنار می‌گذارد و رشته برای
   * بقیه می‌ماند. هر دو پیش از اجرا تأیید می‌خواهند — مثلِ هر حذفِ دیگرِ اپ.
   */
  const removeThread = async () => {
    if (!thread) return;
    const everyone = thread.thread.canDelete;
    const ok = await confirm({
      title: thread.group
        ? tr('این گروه با همهٔ پیام‌هایش حذف شود؟')
        : everyone ? tr('این گفتگو برای همه حذف شود؟') : tr('این گفتگو از صندوقِ شما برداشته شود؟'),
      description: thread.group
        ? tr('گروه برای همهٔ اعضا پاک می‌شود و برنمی‌گردد.')
        : everyone
          ? tr('پیام‌های آن برای طرفِ مقابل هم پاک می‌شوند.')
          : tr('گفتگو برای طرفِ مقابل می‌ماند.'),
      confirmLabel: tr('حذف'),
    });
    if (!ok) return;
    startTransition(async () => {
      const result = everyone
        ? await deleteThreadAction(thread.thread.id)
        : await leaveThreadAction(thread.thread.id);
      if (result.error) show(tr(result.error), 'error');
      else { onClose?.(); show(tr('گفتگو حذف شد.'), 'success'); }
    });
  };

  /** بی‌صدا کردنِ گروه — فقط برای خودِ بیننده. */
  const toggleMute = () => {
    if (!thread?.group) return;
    const next = !thread.group.muted;
    startTransition(async () => {
      const result = await setMutedAction(thread.thread.id, next);
      if (result.error) { show(tr(result.error), 'error'); return; }
      setThread((cur) => (cur?.group ? { ...cur, group: { ...cur.group, muted: next } } : cur));
      show(next ? tr('گروه بی‌صدا شد؛ منشن‌ها همچنان می‌رسند.') : tr('اعلان‌های گروه دوباره روشن شد.'), 'success');
    });
  };

  /** حذفِ یک پیام در گروه — نویسنده یا مدیر (سرور هم می‌سنجد). */
  const removeMessage = async (messageId: number) => {
    if (!thread) return;
    const ok = await confirm({ title: tr('این پیام حذف شود؟'), confirmLabel: tr('حذف') });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteGroupMessageAction(messageId);
      if (result.error) { show(tr(result.error), 'error'); return; }
      setThread((cur) => (cur ? { ...cur, messages: cur.messages.filter((m) => m.id !== messageId) } : cur));
    });
  };

  if (thread === null || thread.thread.id !== threadId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      {/* سربرگ: طرفِ مقابل (ماسک‌شده) + نشانِ اعلانِ یک‌طرفه — پورتِ `chat.php`. */}
      <header className="flex items-center gap-3 border-b px-3 py-2.5">
        {onClose && backButtonClass !== null && (
          <IconButton
            variant="ghost"
            label={tr('صندوق پیام')}
            className={backButtonClass}
            onClick={onClose}
          >
            <ArrowRight className="ltr:rotate-180" />
          </IconButton>
        )}
        {thread.group
          ? <GroupIcon kind={thread.group.kind} size="default" />
          : <ChatAvatar label={thread.thread.label} userId={thread.thread.avatarUserId} />}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="truncate text-sm font-semibold">{thread.thread.label || tr('گفتگو')}</h2>
          {thread.group ? (
            <p className="truncate text-xs text-muted-foreground">
              {tr('{n} عضو', { n: thread.group.memberCount })}
              {thread.group.retentionDays > 0 && (
                <> · {tr('پیام‌ها {days} روز می‌مانند', { days: thread.group.retentionDays })}</>
              )}
              {thread.group.projectId && showProjectLink && (
                <> · <Link href={`/projects/${thread.group.projectId}`} className="underline-offset-4 hover:underline">{tr('صفحهٔ پروژه')}</Link></>
              )}
            </p>
          ) : !thread.thread.allowReply && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Megaphone className="size-3" />
              {tr('اعلان یک‌طرفه')}
            </p>
          )}
        </div>
        {/* بی‌صدا فقط برای خودِ بیننده؛ منشن همیشه می‌رسد. */}
        {thread.group && (
          <IconButton
            variant="ghost"
            label={thread.group.muted ? tr('روشن کردنِ اعلان‌های گروه') : tr('بی‌صدا کردنِ گروه')}
            className="text-muted-foreground"
            disabled={pending}
            onClick={toggleMute}
          >
            {thread.group.muted ? <BellOff /> : <Bell />}
          </IconButton>
        )}
        {/* ⚠️ از گروه نمی‌شود «بیرون رفت»؛ حذف فقط برای کسی که حقِ حذفِ کلِ گروه را دارد. */}
        {(!thread.group || thread.thread.canDelete) && (
          <IconButton
            variant="ghost"
            label={thread.group ? tr('حذفِ گروه') : thread.thread.canDelete ? tr('حذف گفتگو') : tr('حذف از صندوق')}
            className="text-muted-foreground hover:text-destructive"
            disabled={pending}
            onClick={() => { void removeThread(); }}
          >
            {pending ? <Spinner /> : <Trash2 />}
          </IconButton>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
          }}
          className="h-full overflow-y-auto overscroll-contain"
        >
          <div className="flex min-h-full flex-col justify-end gap-4 p-4">
            {/*
              پیام‌های خودم سمتِ دیگر و رنگی؛ نامِ فرستنده فقط سرِ دستهٔ پیام‌های دیگران.
              تیکِ ✓/✓✓ (R-MSG-07): ✓✓ وقتی **همهٔ** طرف‌های دیگر به آن رسیده‌اند —
              و مثلِ نسخهٔ قبلی فقط برای مدیران نمایش داده می‌شود.
            */}
            {blocks.map((block) => {
              if (block.kind === 'day') {
                return (
                  <Marker key={block.key} variant="separator" className="text-xs">
                    <MarkerContent className={cn(block.day !== today && block.day !== yesterday && 'num')}>
                      {dayLabel(block.day)}
                    </MarkerContent>
                  </Marker>
                );
              }
              const mine = block.fromUserId === viewerId;
              return (
                <MessageGroup key={block.key}>
                  {block.items.map((m, i) => {
                    const lastInGroup = i === block.items.length - 1;
                    const read = m.id <= thread.readUpTo;
                    return (
                      <Message key={m.id} align={mine ? 'end' : 'start'}>
                        {!mine && (
                          <MessageAvatar className={cn(!lastInGroup && 'invisible')}>
                            <ChatAvatar label={block.fromName} userId={block.fromAvatarId} />
                          </MessageAvatar>
                        )}
                        <MessageContent className="gap-1">
                          {!mine && i === 0 && <MessageHeader>{block.fromName}</MessageHeader>}
                          <Bubble variant={mine ? 'default' : 'muted'} align={mine ? 'end' : 'start'}>
                            <BubbleContent className="whitespace-pre-wrap">
                              <MessageBody body={m.body} names={thread.mentionNames} viewerId={viewerId} onPrimary={mine} />
                            </BubbleContent>
                          </Bubble>
                          <MessageFooter className="gap-1 font-normal">
                            <Hint label={formatDateTime(m.createdAt, tz)}>
                              <span className="num">{formatDateTime(m.createdAt, tz).slice(11)}</span>
                            </Hint>
                            {/* حذفِ تک‌پیام فقط در گروه: پیامِ خودم، یا هر پیام برای مدیر. */}
                            {thread.group && (mine || thread.thread.canDelete) && (
                              <button
                                type="button"
                                onClick={() => { void removeMessage(m.id); }}
                                className="text-muted-foreground/70 hover:text-destructive"
                                aria-label={tr('حذفِ این پیام')}
                              >
                                <Trash2 className="size-3" />
                              </button>
                            )}
                            {mine && thread.thread.showReceipts && (
                              <Hint label={read ? tr('خوانده شد') : tr('تحویل شد')}>
                                <span
                                  className={cn('inline-flex', read && 'text-primary')}
                                  aria-label={read ? tr('خوانده شد') : tr('تحویل شد')}
                                >
                                  {read ? <CheckCheck className="size-3.5" /> : <Check className="size-3.5" />}
                                </span>
                              </Hint>
                            )}
                          </MessageFooter>
                        </MessageContent>
                      </Message>
                    );
                  })}
                </MessageGroup>
              );
            })}
          </div>
        </div>

        {/* رفتن به آخرین پیام — فقط وقتی کاربر از ته فاصله گرفته. */}
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          onClick={scrollToEnd}
          aria-label={tr('رفتن به آخرین پیام')}
          className={cn(
            'absolute inset-x-0 bottom-3 mx-auto rounded-full border shadow-sm transition-opacity',
            atEnd && 'pointer-events-none opacity-0',
          )}
        >
          <ArrowDown />
        </Button>
      </div>

      {thread.canReply && thread.group ? (
        <GroupComposer
          key={thread.thread.id}
          threadId={thread.thread.id}
          formAction={replyFormAction}
          state={replyState}
          mentionables={thread.group.mentionables}
          canMentionAll={thread.group.canMentionAll}
          placeholder={tr('پیام… (@ برای منشن، {keys} برای ارسال)', { keys: sendKeys })}
        />
      ) : thread.group?.readOnly === 'archived' ? (
        <p className="flex items-center gap-2 border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <Archive className="size-3.5 shrink-0" />
          {tr('این پروژه بایگانی شده است؛ گروهش فقط‌خواندنی است.')}
        </p>
      ) : thread.group?.readOnly === 'announce' ? (
        <p className="flex items-center gap-2 border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <Megaphone className="size-3.5 shrink-0" />
          {tr('در این کانال فقط مدیران می‌نویسند.')}
        </p>
      ) : thread.canReply ? (
        <form action={replyFormAction} className="border-t p-3">
          <input type="hidden" name="threadId" value={thread.thread.id} />
          <div className="flex items-end gap-2">
            <Textarea
              name="body"
              rows={1}
              placeholder={tr('پاسخ شما… ({keys} برای ارسال)', { keys: sendKeys })}
              aria-label={tr('پاسخ شما…')}
              onKeyDown={submitOnModEnter}
              required
              className="max-h-40 min-h-10 resize-none"
            />
            <SendButton label={tr('ارسال')} />
          </div>
          {replyState.error && <p className="mt-2 text-xs text-destructive">{tr(replyState.error)}</p>}
        </form>
      ) : (
        <p className="flex items-center gap-2 border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <Megaphone className="size-3.5 shrink-0" />
          {tr('این یک اعلانِ یک‌طرفه است و امکان پاسخ ندارد.')}
        </p>
      )}
    </>
  );
}
