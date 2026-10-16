'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { BellOff, ChevronDown, Hash, Inbox, Megaphone, MessagesSquare, Plus, ShieldQuestion } from 'lucide-react';
import { composeAction, contactManagementAction, type MessageState } from './_form/actions';
import { CreateChannelDialog, type ChannelOptions } from './group-parts';
import { ComposeDialog } from './compose-dialog';
import { ChatAvatar, GroupIcon, ThreadPane } from './thread-pane';
import { groupInbox } from '@/domain/messaging/labels';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { submitOnModEnter, useModEnterLabel } from '@/lib/submit-shortcut';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-shell';
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



/** سرتیترِ یک بخشِ صندوق — کانال‌ها، گروه‌های پروژه، گفتگوها. */
function InboxSection({ label }: { label: string }) {
  return (
    <li role="presentation" className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground first:pt-1">
      {label}
    </li>
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
  const [openId, setOpenId] = useState<number | null>(initialThreadId);
  const [composeOpen, setComposeOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [composeState, composeFormAction] = useActionState<MessageState, FormData>(composeAction, {});
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [mgmtState, mgmtFormAction] = useActionState<MessageState, FormData>(
    contactManagementAction, {},
  );


  /** جستجو و زبانهٔ «خوانده‌نشده» — فقط نمایشِ صندوق را باریک می‌کنند. */
  const [query, setQuery] = useState('');
  const [box, setBox] = useState<'all' | 'unread'>('all');




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
          ) : (
            <ThreadPane
              key={openId}
              threadId={openId}
              viewerId={viewerId}
              poll={poll}
              onClose={() => setOpenId(null)}
            />
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
