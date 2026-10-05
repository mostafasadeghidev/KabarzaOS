'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Archive, Bell, BellOff, Check, CheckCheck, ChevronDown, FolderKanban, Hash, Inbox, Megaphone, MessagesSquare, Plus, ShieldQuestion, Trash2 } from 'lucide-react';
import {
  composeAction, contactManagementAction, deleteGroupMessageAction, deleteThreadAction, leaveThreadAction,
  openThreadAction, replyAction, setMutedAction, type MessageState,
} from './_form/actions';
import {
  CreateChannelDialog, GroupComposer, MessageBody, SendButton, type ChannelOptions,
} from './group-parts';
import { ComposeDialog } from './compose-dialog';
import { groupInbox } from '@/domain/messaging/labels';
import { monogram } from '@/domain/files/monogram';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DefaultAvatar } from '@/components/default-avatar';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Marker, MarkerContent } from '@/components/ui/marker';
import {
  Message, MessageAvatar, MessageContent, MessageFooter, MessageGroup, MessageHeader,
} from '@/components/ui/message';
import { Spinner } from '@/components/ui/spinner';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { submitOnModEnter, useModEnterLabel } from '@/lib/submit-shortcut';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-shell';
import { useConfirm } from '@/components/ui/confirm';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatCompact, formatDateTime } from '@/i18n/datetime';
import { cn } from '@/lib/utils';
import { SearchInput } from '@/components/ui/search-input';
import { Hint } from '@/components/ui/tooltip';
import { Item, ItemContent, ItemMedia } from '@/components/ui/item';

export interface InboxRow {
  id: number;
  /** `direct` گفتگوی دونفره؛ `channel` کانالِ تیم؛ `project` گروهِ پروژه. */
  kind: 'direct' | 'channel' | 'project';
  /** گروهِ بی‌صدا — شمارنده خاکستری و بیرون از جمعِ خوانده‌نشده. */
  muted: boolean;
  allowReply: boolean;
  broadcastId: number | null;
  isMine: boolean;
  counterparts: Array<{ userId: number; name: string }>;
  /** برچسبِ طرفِ مقابل — ماسک‌شده سمتِ سرور (R-MSG-03). */
  label: string;
  /** عکسِ طرفِ مقابل در گفتگوی دونفره؛ تهی برای «مدیریت» و گروه‌ها. */
  avatarUserId?: number | null;
  lastBody: string;
  lastAt: Date | string | null;
  lastFromName: string | null;
  unread: number;
}

export interface RecipientOption {
  id: number;
  name: string;
  role: string;
}

/** دادهٔ فیلترِ زنده — دفاتر، پروژه‌ها و عضویت‌ها. */
export interface FilterData {
  offices: Array<{ id: number; name: string }>;
  projects: Array<{
    id: number; title: string; officeId: number | null;
    memberIds: number[]; clientIds: number[];
  }>;
  officeMembers: Record<number, number[]>;
}

type Thread = Awaited<ReturnType<typeof openThreadAction>>;
type ThreadMessage = Thread['messages'][number];

/**
 * آواتارِ گفتگو — تک‌نگارِ رنگی روی `Avatar` ِ shadcn.
 *
 * ⚠️ رنگ فقط از **برچسب** ساخته می‌شود، نه از شناسهٔ کاربر: برچسب سمتِ سرور
 * ماسک می‌شود (R-MSG-03) و همهٔ مدیران «مدیریت»اند. اگر رنگ از شناسهٔ واقعی
 * می‌آمد، دو «مدیریت» با دو رنگ از هم تشخیص داده می‌شدند و ماسک بی‌اثر می‌شد.
 */
function ChatAvatar({ label, userId, size = 'default' }: {
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
    </Avatar>
  );
}

/** سرتیترِ یک بخشِ صندوق — کانال‌ها، گروه‌های پروژه، گفتگوها. */
function InboxSection({ label }: { label: string }) {
  return (
    <li role="presentation" className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground first:pt-1">
      {label}
    </li>
  );
}

/** نشانِ گروه به‌جای آواتار — # برای کانالِ تیم، پوشه برای گروهِ پروژه. */
function GroupIcon({ kind, size = 'lg' }: { kind: 'channel' | 'project'; size?: 'default' | 'lg' }) {
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

/** یک ردیفِ صندوق — هم تک‌گفتگو هم فرزندِ آکاردئونِ ارسالِ همگانی. */
function InboxRowButton({
  row, open, onOpen, tz,
}: {
  row: InboxRow; open: boolean; onOpen: (id: number) => void; tz: string;
}) {
  const tr = useT();
  const unread = row.unread > 0;
  // ردیفِ Item ِ shadcn: رسانه (آواتار) + محتوا؛ زمانِ دقیق در راهنمای شناور، نه title ِ مرورگر.
  return (
    <Item asChild size="xs" className={cn('w-full gap-3 py-2.5 text-start', open ? 'bg-accent' : 'hover:bg-accent/60')}>
      <button
        type="button"
        onClick={() => onOpen(row.id)}
        aria-current={open ? 'true' : undefined}
      >
        <ItemMedia>
          {row.kind === 'direct' ? <ChatAvatar label={row.label} userId={row.avatarUserId} size="lg" /> : <GroupIcon kind={row.kind} />}
        </ItemMedia>
        <ItemContent className="gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
              {row.label || '—'}
            </span>
            {!row.allowReply && (
              <Megaphone className="size-3.5 shrink-0 text-muted-foreground" aria-label={tr('اعلان یک‌طرفه')} />
            )}
            {row.muted && <BellOff className="size-3.5 shrink-0 text-muted-foreground" aria-label={tr('بی‌صدا')} />}
            <Hint label={formatDateTime(row.lastAt, tz)}>
              <span className={cn('num ms-auto shrink-0 text-xs', unread ? 'font-medium text-primary' : 'text-muted-foreground')}>
                {formatCompact(row.lastAt, tz)}
              </span>
            </Hint>
          </span>
          <span className="flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-xs', unread ? 'text-foreground' : 'text-muted-foreground')}>
              {row.lastBody}
            </span>
            {unread && (
              <Badge
                variant={row.muted ? 'secondary' : 'default'}
                className="num h-5 min-w-5 shrink-0 rounded-full px-1.5"
              >
                {row.unread}
              </Badge>
            )}
          </span>
        </ItemContent>
      </button>
    </Item>
  );
}

/** دکمهٔ ارسالِ فرم‌های دیالوگ — با برچسب. */
function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Spinner /> : label}
    </Button>
  );
}

/**
 * آکاردئونِ یک ارسالِ همگانی در صندوقِ فرستنده (R-MSG-01).
 *
 * ⚠️ Collapsible ِ shadcn به‌جای `<details>` ِ خام: همان رفتار (کلیک باز و
 * بسته می‌کند)، ولی حالتِ باز در React است — پس وقتی یکی از گفتگوهای داخلش
 * باز می‌شود گروه هم خودش باز می‌شود، و بستنِ دستیِ کاربر هم سرِ جایش می‌ماند.
 */
function BroadcastGroup({
  threads, unread, openId, onOpen, tz,
}: {
  threads: InboxRow[]; unread: number; openId: number | null; onOpen: (id: number) => void; tz: string;
}) {
  const tr = useT();
  const holdsOpen = threads.some((t) => t.id === openId);
  const [expanded, setExpanded] = useState(holdsOpen);
  useEffect(() => { if (holdsOpen) setExpanded(true); }, [holdsOpen]);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="group/bc">
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Megaphone className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {tr('ارسالِ همگانی به {n} نفر', { n: threads.length })}
        </span>
        {unread > 0 && (
          <Badge className="num h-5 min-w-5 shrink-0 rounded-full px-1.5">{unread}</Badge>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/bc:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="ms-8 grid gap-0.5 border-s ps-2">
          {threads.map((t) => (
            <li key={t.id}>
              <InboxRowButton row={t} open={openId === t.id} onOpen={onOpen} tz={tz} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
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

/**
 * پیام‌ها — صندوقِ شخصی + گفتگو + نوشتنِ پیامِ نو.
 *
 * ⚠️ هر گفتگو دونفره است: ارسال به چند نفر چند گفتگوی جدا می‌سازد تا
 * گیرنده‌ها همدیگر را نبینند (R-MSG-N1).
 */
export function MessagesView({
  header,
  inbox,
  recipients,
  filters,
  canSend,
  canBroadcast,
  channelOptions = null,
  poll,
  initialThreadId = null,
  viewerId,
}: {
  /**
   * عنوان و توضیحِ صفحه — اینجا کشیده می‌شود چون دکمه‌های «پیام جدید» و
   * «پیام به مدیریت» (state ِ همین کامپوننت) جای ثابتِ دکمهٔ اصلی را در
   * سرصفحه می‌گیرند، مثلِ هر صفحهٔ دیگر.
   */
  header: { title: React.ReactNode; description?: React.ReactNode };
  inbox: InboxRow[];
  recipients: RecipientOption[];
  filters: FilterData;
  canSend: boolean;
  /** پولِ گفت‌وگوی زنده — از تنظیماتِ سامانه. */
  poll: { enabled: boolean; seconds: number };
  /** پخشِ همگانی («همهٔ اعضا») فقط از مدیر. */
  canBroadcast: boolean;
  /** گزینه‌های «کانالِ تازه» — فقط برای مالک و ادمین؛ برای بقیه `null`. */
  channelOptions?: ChannelOptions | null;
  /**
   * گفتگویی که باید همان اولِ کار باز باشد — مسیرِ `/messages/{id}`.
   * ⚠️ لینکِ اعلانِ پیام دقیقاً همین شکل است و پیش از این به هیچ مسیری
   * نمی‌خورد؛ نتیجه‌اش ۴۰۴ ِ خامِ Next بود، بیرون از پوستهٔ برنامه.
   */
  initialThreadId?: number | null;
  /** خودِ بیننده — پیام‌های او سمتِ دیگر می‌نشینند و تیکِ خواندن می‌گیرند. */
  viewerId: number;
}) {
  const tr = useT();
  const sendKeys = useModEnterLabel();
  const tz = useTimeZone();
  const { show } = useToast();
  const confirm = useConfirm();
  const [openId, setOpenId] = useState<number | null>(initialThreadId);
  const [thread, setThread] = useState<Thread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [composeState, composeFormAction] = useActionState<MessageState, FormData>(composeAction, {});
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [mgmtState, mgmtFormAction] = useActionState<MessageState, FormData>(
    contactManagementAction, {},
  );
  const [replyState, replyFormAction] = useActionState<MessageState, FormData>(replyAction, {});


  /** جستجو و زبانهٔ «خوانده‌نشده» — فقط نمایشِ صندوق را باریک می‌کنند. */
  const [query, setQuery] = useState('');
  const [box, setBox] = useState<'all' | 'unread'>('all');


  useEffect(() => {
    if (openId === null) { setThread(null); return; }
    let alive = true;
    openThreadAction(openId)
      .then((t) => { if (alive) setThread(t); })
      .catch(() => {
        show(tr('این گفتگو در دسترس نیست.'), 'error');
        // ⚠️ گفتگوی باز‌نشدنی بسته می‌شود؛ وگرنه قابِ گفتگو در حالتِ بارگذاری می‌ماند.
        if (alive) setOpenId(null);
      });
    return () => { alive = false; };
  }, [openId, replyState]);

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
    if (!poll.enabled || openId === null) return;
    fpRef.current = '';
    let alive = true;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(
          `/api/messages/poll?thread=${openId}&fp=${encodeURIComponent(fpRef.current)}`,
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
  }, [openId, poll.enabled, poll.seconds]);

  useEffect(() => {
    if (composeState.ok) {
      setComposeOpen(false);
      /**
       * ⚠️ جملهٔ شمارنده‌دار حفظ می‌شود: «پیام به ۷ نفر ارسال شد.» چیزی
       * می‌گوید که «پیام ارسال شد.» نمی‌گوید — و کاربر پس از انتخابِ چند
       * گیرنده دقیقاً همان عدد را می‌خواهد ببیند.
       */
      show(
        composeState.created && composeState.created > 1
          ? tr('پیام به {n} نفر ارسال شد.', { n: composeState.created })
          : tr('پیام ارسال شد.'),
        'success',
      );
    }
  }, [composeState]);

  useEffect(() => {
    if (mgmtState.ok) {
      setMgmtOpen(false);
      show(tr('پیامِ شما به مدیریت فرستاده شد.'), 'success');
    }
  }, [mgmtState]);


  // ---- صندوق: جستجو + «خوانده‌نشده» ----
  // ⚠️ گروهِ بی‌صدا در جمعِ «خوانده‌نشده» نیست — همان قاعدهٔ شمارندهٔ سایدبار.
  const unreadTotal = inbox.reduce((sum, row) => sum + (row.muted ? 0 : row.unread), 0);
  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => inbox.filter((row) =>
    (box === 'all' || (row.unread > 0 && !row.muted))
    && (!needle || row.label.toLowerCase().includes(needle) || row.lastBody.toLowerCase().includes(needle)),
  ), [inbox, box, needle]);
  /*
   * سه بخش: کانال‌های تیم، گروه‌های پروژه، گفتگوها. بخشِ خالی کشیده نمی‌شود، و
   * اگر کاربر هیچ گروهی ندارد صندوق همان فهرستِ قبلی است — بی‌سرتیتر.
   */
  const channelRows = shown.filter((r) => r.kind === 'channel');
  const projectRows = shown.filter((r) => r.kind === 'project');
  const entries = useMemo(() => groupInbox(shown.filter((r) => r.kind === 'direct')), [shown]);
  const sectioned = channelRows.length + projectRows.length > 0;

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
      else { setOpenId(null); show(tr('گفتگو حذف شد.'), 'success'); }
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

  const loading = openId !== null && (thread === null || thread.thread.id !== openId);

  return (
    <>
      <PageHeader
        title={header.title}
        description={header.description}
        actions={(canSend || !canBroadcast) ? (
          <>
            {/*
              ⚠️ «پیام به مدیریت» به `canSend` بسته **نیست**: کسی که حق ندارد
              گیرنده انتخاب کند هم باید بتواند به مدیریت پیام بدهد.
            */}
            {!canBroadcast && (
              <Button variant="outline" onClick={() => setMgmtOpen(true)}>
                <ShieldQuestion />
                {tr('پیام به مدیریت')}
              </Button>
            )}
            {channelOptions && (
              <Button variant="outline" onClick={() => setChannelOpen(true)}>
                <Hash />
                {tr('کانالِ تازه')}
              </Button>
            )}
            {canSend && (
              <Button onClick={() => setComposeOpen(true)}>
                <Plus />
                {tr('پیام جدید')}
              </Button>
            )}
          </>
        ) : undefined}
      />

      {/*
        ⚠️ چیدمانِ «Mail» ِ shadcn: یک قاب، دو ستون — صندوق و گفتگو — که تا
        کفِ صفحه می‌آیند و هر کدام خودش اسکرول می‌خورد. روی صفحهٔ باریک فقط
        یکی دیده می‌شود: صندوق، و با بازشدنِ گفتگو خودِ گفتگو با دکمهٔ برگشت.
      */}
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs @3xl/main:grid-cols-[20rem_minmax(0,1fr)] @5xl/main:grid-cols-[24rem_minmax(0,1fr)]">
        {/* ---- صندوق ---- */}
        <section
          aria-label={tr('صندوق پیام')}
          className={cn('flex min-h-0 flex-col @3xl/main:border-e', openId !== null && 'hidden @3xl/main:flex')}
        >
          <div className="grid gap-3 border-b p-3">
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('جستجوی گفتگو…')}
              aria-label={tr('جستجوی گفتگو…')}
              containerClassName="sm:w-full"
            />
            <Tabs value={box} onValueChange={(v) => setBox(v as typeof box)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="all">{tr('همه')}</TabsTrigger>
                <TabsTrigger value="unread">
                  {tr('خوانده‌نشده')}
                  {unreadTotal > 0 && (
                    <Badge variant="secondary" className="num px-1.5 py-0 text-[10px]">{unreadTotal}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {inbox.length === 0 ? (
              <EmptyState className="m-3 border-0" icon={<Inbox />} title={tr('هنوز پیامی ندارید.')} />
            ) : shown.length === 0 ? (
              <EmptyState className="m-3 border-0" title={needle ? tr('نتیجه‌ای نیست') : tr('موردی نیست.')} />
            ) : (
              <ul className="grid gap-0.5 p-2">
                {channelRows.length > 0 && <InboxSection label={tr('کانال‌های تیم')} />}
                {channelRows.map((row) => (
                  <li key={row.id}>
                    <InboxRowButton row={row} open={openId === row.id} onOpen={setOpenId} tz={tz} />
                  </li>
                ))}
                {projectRows.length > 0 && <InboxSection label={tr('گروه‌های پروژه')} />}
                {projectRows.map((row) => (
                  <li key={row.id}>
                    <InboxRowButton row={row} open={openId === row.id} onOpen={setOpenId} tz={tz} />
                  </li>
                ))}
                {sectioned && entries.length > 0 && <InboxSection label={tr('گفتگوها')} />}
                {/*
                  ⚠️ R-MSG-01 — گفتگوهای یک ارسالِ همگانی در صندوقِ **فرستنده** یک
                  آکاردئون‌اند (شمار، جمعِ خوانده‌نشده، ردیف‌های فرزند)؛ گیرنده هر
                  کدام را جدا و بی‌خبر از بقیه می‌بیند. قاعده در `groupInbox`.
                */}
                {entries.map((entry) => (entry.kind === 'single' ? (
                  <li key={entry.thread.id}>
                    <InboxRowButton row={entry.thread} open={openId === entry.thread.id} onOpen={setOpenId} tz={tz} />
                  </li>
                ) : (
                  <li key={`g${entry.broadcastId}`}>
                    <BroadcastGroup
                      threads={entry.threads}
                      unread={entry.unread}
                      openId={openId}
                      onOpen={setOpenId}
                      tz={tz}
                    />
                  </li>
                )))}
              </ul>
            )}
          </div>
        </section>

        {/* ---- گفتگو ---- */}
        <section
          aria-label={tr('گفتگو')}
          className={cn('flex min-h-0 flex-col', openId === null && 'hidden @3xl/main:flex')}
        >
          {openId === null ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                className="max-w-sm border-0"
                icon={<MessagesSquare />}
                title={tr('گفتگویی انتخاب نشده')}
                description={tr('از فهرستِ کنار یکی را باز کنید.')}
              />
            </div>
          ) : loading || thread === null ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <Spinner />
            </div>
          ) : (
            <>
              {/* سربرگ: طرفِ مقابل (ماسک‌شده) + نشانِ اعلانِ یک‌طرفه — پورتِ `chat.php`. */}
              <header className="flex items-center gap-3 border-b px-3 py-2.5">
                <IconButton
                  variant="ghost"
                  label={tr('صندوق پیام')}
                  className="@3xl/main:hidden"
                  onClick={() => setOpenId(null)}
                >
                  <ArrowRight className="ltr:rotate-180" />
                </IconButton>
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
                      {thread.group.projectId && (
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
          )}
        </section>
      </div>

      {channelOptions && (
        <CreateChannelDialog
          open={channelOpen}
          onOpenChange={setChannelOpen}
          options={channelOptions}
          onCreated={(threadId) => {
            setChannelOpen(false);
            setOpenId(threadId);
            show(tr('کانال ساخته شد.'), 'success');
          }}
        />
      )}

      {/* ---- نوشتنِ پیامِ نو ---- */}
      <Dialog open={mgmtOpen} onOpenChange={setMgmtOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("پیام به مدیریت")}</DialogTitle>
            <DialogDescription>
              {tr("پیامِ شما در یک گفتگوی مشترک به همهٔ مدیران می‌رسد؛ گیرنده‌ای انتخاب نمی‌کنید و همه پاسخ‌های یکدیگر را می‌بینند.")}
            </DialogDescription>
          </DialogHeader>

          <form action={mgmtFormAction} className="grid gap-3">
            <Field>
              <FieldLabel htmlFor="mgmt-body">{tr("متنِ پیام")}</FieldLabel>
              <Textarea
                id="mgmt-body" name="body" rows={5} required
                placeholder={tr('{keys} برای ارسال', { keys: sendKeys })} onKeyDown={submitOnModEnter}
              />
            </Field>
            {mgmtState.error && (
              <p className="text-xs text-destructive">{tr(mgmtState.error)}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMgmtOpen(false)}>
                {tr("انصراف")}
              </Button>
              <SubmitButton label={tr("ارسال")} />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        recipients={recipients}
        filters={filters}
        canBroadcast={canBroadcast}
        formAction={composeFormAction}
        state={composeState}
      />
    </>
  );
}
