'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Megaphone, Plus, Send, ShieldQuestion, Trash2 } from 'lucide-react';
import {
  composeAction, contactManagementAction, leaveThreadAction, openThreadAction, replyAction,
  type MessageState,
} from './_form/actions';
import { AUDIENCE_LABELS, type Audience } from '@/domain/messaging/threads';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import {
  allowedRecipients, keepsProject, pickableRecipients, visibleProjects,
} from '@/domain/messaging/recipient-filter';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';

export interface InboxRow {
  id: number;
  allowReply: boolean;
  broadcastId: number | null;
  isMine: boolean;
  counterparts: Array<{ userId: number; name: string }>;
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

function when(value: Date | string | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? '…' : label}
    </Button>
  );
}

/**
 * پیام‌ها — صندوقِ شخصی + گفتگو + نوشتنِ پیامِ نو.
 *
 * ⚠️ هر گفتگو دونفره است: ارسال به چند نفر چند گفتگوی جدا می‌سازد تا
 * گیرنده‌ها همدیگر را نبینند (R-MSG-N1).
 */
export function MessagesView({
  inbox,
  recipients,
  filters,
  canSend,
  canBroadcast,
  poll,
  initialThreadId = null,
}: {
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
}) {
  const tr = useT();
  const { show } = useToast();
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
      .catch(() => show(tr('این گفتگو در دسترس نیست.'), 'error'));
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
          changed: boolean; fingerprint?: string; messages?: Thread['messages'];
        };
        if (!alive) return;
        if (data.fingerprint) fpRef.current = data.fingerprint;
        if (data.changed && data.messages) {
          setThread((cur) => (cur ? { ...cur, messages: data.messages! } : cur));
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

  return (
    <div className="grid gap-4 @3xl/main:grid-cols-[22rem_1fr]">
      {/* ---- صندوق ---- */}
      <section className="grid content-start gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{tr("صندوق پیام")}</h2>
          <div className="flex gap-1">
            {/*
              ⚠️ «پیام به مدیریت» به `canSend` بسته **نیست**: کسی که حق ندارد
              گیرنده انتخاب کند هم باید بتواند به مدیریت پیام بدهد.
            */}
            {!canBroadcast && (
              <Button size="sm" variant="outline" onClick={() => setMgmtOpen(true)}>
                <ShieldQuestion className="size-4" />
                {tr("پیام به مدیریت")}
              </Button>
            )}
            {canSend && (
              <Button size="sm" onClick={() => setComposeOpen(true)}>
                <Plus className="size-4" />
                {tr("پیام جدید")}
              </Button>
            )}
          </div>
        </div>


        {inbox.length === 0 ? (
          <EmptyState title={tr("هنوز پیامی ندارید.")} />
        ) : (
          <ul className="grid gap-1">
            {inbox.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(t.id)}
                  className={`w-full rounded-md border p-3 text-start transition-colors hover:bg-muted/50 ${
                    openId === t.id ? 'border-primary bg-muted/40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {t.counterparts.map((c) => c.name).join('، ') || '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      {!t.allowReply && (
                        <Megaphone className="size-3.5 text-muted-foreground" aria-label={tr("اعلان یک‌طرفه")} />
                      )}
                      {t.unread > 0 && <Badge className="num">{t.unread}</Badge>}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{t.lastBody}</p>
                  <p className="num mt-0.5 text-[11px] text-muted-foreground">{when(t.lastAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- گفتگو ---- */}
      <section className="grid content-start gap-3">
        {thread === null ? (
          <EmptyState title={tr("گفتگویی انتخاب نشده")} description={tr("از فهرستِ کنار یکی را باز کنید.")} />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{tr("گفتگو")}</h2>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await leaveThreadAction(thread.thread.id);
                    if (result.error) show(tr(result.error), 'error');
                    else { setOpenId(null); show(tr('گفتگو حذف شد.'), 'success'); }
                  })
                }
              >
                <Trash2 className="size-3.5" />
                {tr("حذف گفتگو")}
              </Button>
            </div>

            <ul className="grid gap-2">
              {thread.messages.map((m) => (
                <li key={m.id} className="rounded-md border p-3">
                  <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.fromName ?? '—'} · <span className="num">{when(m.createdAt)}</span>
                  </p>
                </li>
              ))}
            </ul>

            {thread.canReply ? (
              <form action={replyFormAction} className="grid gap-2">
                <input type="hidden" name="threadId" value={thread.thread.id} />
                <Textarea name="body" rows={2} placeholder={tr("پاسخ شما…")} required />
                {replyState.error && <p className="text-xs text-destructive">{tr(replyState.error)}</p>}
                <div className="flex justify-end">
                  <SubmitButton label={tr("ارسال")} />
                </div>
              </form>
            ) : (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {tr("این یک اعلانِ یک‌طرفه است و امکان پاسخ ندارد.")}
              </p>
            )}
          </>
        )}
      </section>

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
                <select
                  id="msg-audience"
                  name="audience"
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as '' | Audience)}
                >
                  <option value="">{tr("— انتخابِ دستی —")}</option>
                  {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((key) => (
                    <option key={key} value={key}>{AUDIENCE_LABELS[key]}</option>
                  ))}
                </select>
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
                  <select
                    aria-label={tr("فیلترِ دفتر")}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={officeId ?? ''}
                    onChange={(e) => setOfficeId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{tr("همهٔ دفاتر")}</option>
                    {filters.offices.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label={tr("فیلترِ پروژه")}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={projectId ?? ''}
                    onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{tr("همهٔ پروژه‌ها")}</option>
                    {shownProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>

                <div className="grid max-h-48 gap-1 overflow-y-auto">
                  {shownRecipients.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="recipients"
                        value={r.id}
                        checked={picked.has(r.id)}
                        onChange={() => togglePick(r.id)}
                        className="size-4 accent-primary"
                      />
                      {r.name}
                    </label>
                  ))}
                  {shownRecipients.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {recipients.length === 0
                        ? 'مخاطبی برای ارسال نیست.'
                        : 'با این فیلتر کسی پیدا نشد.'}
                    </p>
                  )}
                </div>
                {picked.size > 0 && (
                  <button
                    type="button"
                    className="justify-self-start text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setPicked(new Set())}
                  >
                    {tr("پاک کردن همه")}
                  </button>
                )}
              </fieldset>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="msg-body">{tr("متن پیام")}</Label>
              <Textarea id="msg-body" name="body" rows={4} required />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="allowReply"
                defaultChecked
                className="mt-0.5 size-4 accent-primary"
              />
              {tr("پاسخ مجاز باشد (برای سؤال)؛ بدون تیک = اعلانِ یک‌طرفه")}
            </label>

            {composeState.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {tr(composeState.error)}
              </p>
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
    </div>
  );
}
