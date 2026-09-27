'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  ArrowDown, ArrowRight, Check, CheckCheck, ChevronDown, CircleAlert, Inbox, Megaphone,
  MessagesSquare, Plus, Search, SendHorizontal, ShieldQuestion, Trash2,
} from 'lucide-react';
import {
  composeAction, contactManagementAction, deleteThreadAction, leaveThreadAction, openThreadAction,
  replyAction, type MessageState,
} from './_form/actions';
import { AUDIENCE_LABELS, type Audience } from '@/domain/messaging/threads';
import { groupInbox } from '@/domain/messaging/labels';
import { monogram } from '@/domain/files/monogram';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Marker, MarkerContent } from '@/components/ui/marker';
import {
  Message, MessageAvatar, MessageContent, MessageFooter, MessageGroup, MessageHeader,
} from '@/components/ui/message';
import { Spinner } from '@/components/ui/spinner';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-shell';
import { useConfirm } from '@/components/ui/confirm';
import {
  allowedRecipients, keepsProject, pickableRecipients, visibleProjects,
} from '@/domain/messaging/recipient-filter';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatCompact, formatDateTime } from '@/i18n/datetime';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export interface InboxRow {
  id: number;
  allowReply: boolean;
  broadcastId: number | null;
  isMine: boolean;
  counterparts: Array<{ userId: number; name: string }>;
  /** برچسبِ طرفِ مقابل — ماسک‌شده سمتِ سرور (R-MSG-03). */
  label: string;
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
function ChatAvatar({ label, size = 'default' }: { label: string; size?: 'sm' | 'default' | 'lg' }) {
  const { letter, background } = monogram(0, label || '—');
  return (
    <Avatar size={size}>
      <AvatarFallback className="font-semibold text-white" style={{ background }}>
        {letter}
      </AvatarFallback>
    </Avatar>
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
  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      aria-current={open ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors',
        open ? 'bg-accent' : 'hover:bg-accent/60',
      )}
    >
      <ChatAvatar label={row.label} size="lg" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
            {row.label || '—'}
          </span>
          {!row.allowReply && (
            <Megaphone className="size-3.5 shrink-0 text-muted-foreground" aria-label={tr('اعلان یک‌طرفه')} />
          )}
          <span
            className={cn('num ms-auto shrink-0 text-xs', unread ? 'font-medium text-primary' : 'text-muted-foreground')}
            title={formatDateTime(row.lastAt, tz)}
          >
            {formatCompact(row.lastAt, tz)}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-xs', unread ? 'text-foreground' : 'text-muted-foreground')}>
            {row.lastBody}
          </span>
          {unread && (
            <Badge className="num h-5 min-w-5 shrink-0 rounded-full px-1.5">{row.unread}</Badge>
          )}
        </span>
      </span>
    </button>
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

/** دکمهٔ ارسالِ پاسخ — آیکونی مثلِ هر پیام‌رسان؛ برچسب در تولتیپ و برای صفحه‌خوان. */
function SendButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <IconButton type="submit" label={label} disabled={pending} className="size-10 shrink-0 rounded-full">
      {pending ? <Spinner /> : <SendHorizontal className="rtl:-scale-x-100" />}
    </IconButton>
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
  | { kind: 'group'; key: string; fromUserId: number; fromName: string; items: ThreadMessage[] };

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
    else blocks.push({ kind: 'group', key: `g${m.id}`, fromUserId: m.fromUserId, fromName: m.fromName ?? '—', items: [m] });
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
  const tz = useTimeZone();
  const { show } = useToast();
  const confirm = useConfirm();
  const [openId, setOpenId] = useState<number | null>(initialThreadId);
  const [thread, setThread] = useState<Thread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [composeState, composeFormAction] = useActionState<MessageState, FormData>(composeAction, {});
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [mgmtState, mgmtFormAction] = useActionState<MessageState, FormData>(
    contactManagementAction, {},
  );
  const [replyState, replyFormAction] = useActionState<MessageState, FormData>(replyAction, {});

  const [audience, setAudience] = useState<'' | Audience>('');
  const [picked, setPicked] = useState<Set<number>>(new Set());

  /** جستجو و زبانهٔ «خوانده‌نشده» — فقط نمایشِ صندوق را باریک می‌کنند. */
  const [query, setQuery] = useState('');
  const [box, setBox] = useState<'all' | 'unread'>('all');

  /**
   * فیلترِ زندهٔ گیرندگان — انتخابِ دفتر پروژه‌ها را باریک می‌کند و
   * «دفتر ∩ پروژه» فهرستِ گیرندگان را. قاعده‌ها در دامنه‌اند (R-MSG-09..11).
   */
  const [officeId, setOfficeId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);

  const shownProjects = visibleProjects(filters.projects, officeId);

  // ⚠️ پروژه‌ای که با تغییرِ دفتر دیگر دیده نمی‌شود باید صفر شود، وگرنه
  // فیلترِ نامرئی فهرستِ گیرندگان را خالی نگه می‌دارد.
  useEffect(() => {
    if (!keepsProject(filters.projects, projectId, officeId)) setProjectId(null);
  }, [filters.projects, projectId, officeId]);

  const allowed = allowedRecipients({
    projects: filters.projects,
    officeMembers: filters.officeMembers,
    officeId,
    projectId,
  });
  const shownRecipients = pickableRecipients(recipients, allowed, picked);

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
        };
        if (!alive) return;
        if (data.fingerprint) fpRef.current = data.fingerprint;
        if (data.changed && data.messages) {
          setThread((cur) => (cur
            ? { ...cur, messages: data.messages!, readUpTo: data.readUpTo ?? cur.readUpTo }
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
      setPicked(new Set());
      setAudience('');
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

  const togglePick = (id: number) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- صندوق: جستجو + «خوانده‌نشده» ----
  const unreadTotal = inbox.reduce((sum, row) => sum + row.unread, 0);
  const needle = query.trim().toLowerCase();
  const entries = useMemo(() => groupInbox(inbox.filter((row) =>
    (box === 'all' || row.unread > 0)
    && (!needle || row.label.toLowerCase().includes(needle) || row.lastBody.toLowerCase().includes(needle)),
  )), [inbox, box, needle]);

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
      title: everyone ? tr('این گفتگو برای همه حذف شود؟') : tr('این گفتگو از صندوقِ شما برداشته شود؟'),
      description: everyone
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
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr('جستجوی گفتگو…')}
                aria-label={tr('جستجوی گفتگو…')}
                className="ps-8"
              />
            </div>
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
            ) : entries.length === 0 ? (
              <EmptyState className="m-3 border-0" title={needle ? tr('نتیجه‌ای نیست') : tr('موردی نیست.')} />
            ) : (
              <ul className="grid gap-0.5 p-2">
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
                    <details className="group/bc" open={entry.threads.some((t) => t.id === openId)}>
                      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60 [&::-webkit-details-marker]:hidden">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Megaphone className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {tr('ارسالِ همگانی به {n} نفر', { n: entry.threads.length })}
                        </span>
                        {entry.unread > 0 && (
                          <Badge className="num h-5 min-w-5 shrink-0 rounded-full px-1.5">{entry.unread}</Badge>
                        )}
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/bc:rotate-180" />
                      </summary>
                      <ul className="ms-8 grid gap-0.5 border-s ps-2">
                        {entry.threads.map((t) => (
                          <li key={t.id}>
                            <InboxRowButton row={t} open={openId === t.id} onOpen={setOpenId} tz={tz} />
                          </li>
                        ))}
                      </ul>
                    </details>
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
                <ChatAvatar label={thread.thread.label} />
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <h2 className="truncate text-sm font-semibold">{thread.thread.label || tr('گفتگو')}</h2>
                  {!thread.thread.allowReply && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Megaphone className="size-3" />
                      {tr('اعلان یک‌طرفه')}
                    </p>
                  )}
                </div>
                <IconButton
                  variant="ghost"
                  label={thread.thread.canDelete ? tr('حذف گفتگو') : tr('حذف از صندوق')}
                  className="text-muted-foreground hover:text-destructive"
                  disabled={pending}
                  onClick={() => { void removeThread(); }}
                >
                  {pending ? <Spinner /> : <Trash2 />}
                </IconButton>
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
                                    <ChatAvatar label={block.fromName} />
                                  </MessageAvatar>
                                )}
                                <MessageContent className="gap-1">
                                  {!mine && i === 0 && <MessageHeader>{block.fromName}</MessageHeader>}
                                  <Bubble variant={mine ? 'default' : 'muted'} align={mine ? 'end' : 'start'}>
                                    <BubbleContent className="whitespace-pre-wrap">{m.body}</BubbleContent>
                                  </Bubble>
                                  <MessageFooter className="gap-1 font-normal">
                                    <span className="num" title={formatDateTime(m.createdAt, tz)}>
                                      {formatDateTime(m.createdAt, tz).slice(11)}
                                    </span>
                                    {mine && thread.thread.showReceipts && (
                                      <span
                                        className={cn('inline-flex', read && 'text-primary')}
                                        title={read ? tr('خوانده شد') : tr('تحویل شد')}
                                        aria-label={read ? tr('خوانده شد') : tr('تحویل شد')}
                                      >
                                        {read ? <CheckCheck className="size-3.5" /> : <Check className="size-3.5" />}
                                      </span>
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

              {thread.canReply ? (
                <form action={replyFormAction} className="border-t p-3">
                  <input type="hidden" name="threadId" value={thread.thread.id} />
                  <div className="flex items-end gap-2">
                    <Textarea
                      name="body"
                      rows={1}
                      placeholder={tr('پاسخ شما…')}
                      aria-label={tr('پاسخ شما…')}
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
            <div className="grid gap-1.5">
              <Label htmlFor="mgmt-body">{tr("متنِ پیام")}</Label>
              <Textarea id="mgmt-body" name="body" rows={5} required />
            </div>
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

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr("پیام جدید")}</DialogTitle>
            <DialogDescription>
              {tr("به هر گیرنده یک گفتگوی جداگانه فرستاده می‌شود؛ گیرنده‌ها همدیگر را نمی‌بینند.")}
            </DialogDescription>
          </DialogHeader>

          <form action={composeFormAction} className="grid gap-3">
            {canBroadcast && (
              <div className="grid gap-1.5">
                <Label htmlFor="msg-audience">{tr("مخاطب")}</Label>
                <NativeSelect
                  id="msg-audience"
                  name="audience"
                  containerClassName="w-full"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as '' | Audience)}
                >
                  <NativeSelectOption value="">{tr("— انتخابِ دستی —")}</NativeSelectOption>
                  {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((key) => (
                    <NativeSelectOption key={key} value={key}>{tr(AUDIENCE_LABELS[key])}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}

            {audience === '' && (
              <fieldset className="grid gap-1.5 rounded-md border p-3">
                <legend className="px-1 text-sm font-medium">{tr("گیرندگان")}</legend>

                {/*
                  فیلترِ زنده. ⚠️ فقط منویِ انتخاب‌شدنی را کوچک می‌کند؛
                  کسی که قبلاً تیک خورده هرگز نمی‌افتد.
                */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <NativeSelect
                    aria-label={tr("فیلترِ دفتر")}
                    value={officeId ?? ''}
                    onChange={(e) => setOfficeId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <NativeSelectOption value="">{tr("همهٔ دفاتر")}</NativeSelectOption>
                    {filters.offices.map((o) => (
                      <NativeSelectOption key={o.id} value={o.id}>{o.name}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <SearchableSelect
                    aria-label={tr("فیلترِ پروژه")}
                    value={projectId ?? ''}
                    onValueChange={(v) => setProjectId(v ? Number(v) : null)}
                  >
                    <NativeSelectOption value="">{tr("همهٔ پروژه‌ها")}</NativeSelectOption>
                    {shownProjects.map((p) => (
                      <NativeSelectOption key={p.id} value={p.id}>{p.title}</NativeSelectOption>
                    ))}
                  </SearchableSelect>
                </div>

                <div className="grid max-h-48 gap-1 overflow-y-auto">
                  {shownRecipients.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        name="recipients"
                        value={String(r.id)}
                        checked={picked.has(r.id)}
                        onCheckedChange={() => togglePick(r.id)}
                      />
                      {r.name}
                      <span className="text-xs text-muted-foreground">
                        ({r.role === 'client' ? tr('کارفرما') : tr('عضو')})
                      </span>
                    </label>
                  ))}
                  {shownRecipients.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {recipients.length === 0
                        ? tr('مخاطبی برای ارسال نیست.')
                        : tr('با این فیلتر کسی پیدا نشد.')}
                    </p>
                  )}
                </div>
                {picked.size > 0 && (
                  <Button
                    type="button" variant="link" size="xs" className="justify-self-start px-0 text-muted-foreground"
                    onClick={() => setPicked(new Set())}
                  >
                    {tr("پاک کردن همه")}
                  </Button>
                )}
              </fieldset>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="msg-body">{tr("متن پیام")}</Label>
              <Textarea id="msg-body" name="body" rows={4} required />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                name="allowReply"
                defaultChecked className="mt-0.5"
              />
              {tr("پاسخ مجاز باشد (برای سؤال)؛ بدون تیک = اعلانِ یک‌طرفه")}
            </label>

            {composeState.error && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertDescription>
                  {tr(composeState.error)}
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setComposeOpen(false)}>
                {tr("بستن")}
              </Button>
              <SubmitButton label={tr("ارسال پیام")} />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
