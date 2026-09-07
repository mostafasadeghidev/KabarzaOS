'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, Reply, RotateCcw, Trash2 } from 'lucide-react';
import {
  addCommentAction, deleteCommentAction, toggleCommentAction, type TabActionState,
} from '../_form/tab-actions';
import { isOpen, statusLabel, type CommentType } from '@/domain/projects/comments';
import { buildThreads, type Thread } from '@/domain/projects/threads';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { useActionToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { useConfirm } from '@/components/ui/confirm';

export interface CommentItem {
  id: number;
  body: string;
  type: string;
  status: string;
  createdAt: Date | string;
  userName: string | null;
  closedAt: Date | string | null;
  closedByName: string | null;
  /** پاسخ زیرِ والدش می‌نشیند (پورتِ `parent_id`). */
  parentId?: number | null;
}

type ThreadItem = CommentItem & { parentId: number | null };

function when(value: Date | string | null | undefined, tz: string): string {
  return formatDateTime(value, tz);
}

function SendButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? tr('در حال ارسال…') : label}
    </Button>
  );
}

function CommentDelete({ commentId, hasReplies }: { commentId: number; hasReplies: boolean }) {
  const t = useT();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={t("حذفِ کامنت")}
      disabled={pending}
      onClick={async () => {
        // پورتِ `Comments::delete`: گره و همهٔ پاسخ‌هایش می‌روند — کاربر باید بداند.
        if (await confirm({
          title: t('این کامنت حذف شود؟'),
          description: hasReplies ? t('پاسخ‌های زیرِ آن هم حذف می‌شوند.') : undefined,
        })) {
          startTransition(async () => { await deleteCommentAction(commentId); });
        }
      }}
      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-60"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

/** نشانِ وضعیت + تیک — فقط روی تازه‌ترین پیامِ رشته (پورتِ افزونه). */
function StatusToggle({ comment, canToggle }: { comment: CommentItem; canToggle: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const open = isOpen(comment.status);
  const label = statusLabel(comment.type as CommentType, comment.status);

  const chip = <Badge variant={open ? 'warning' : 'success'}>{t(label)}</Badge>;
  if (!canToggle) return chip;

  return (
    <div className="flex items-center gap-1">
      {chip}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        title={open ? t('علامت‌زدن به‌عنوانِ انجام‌شده') : t('بازکردنِ دوباره')}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await toggleCommentAction(comment.id);
            if (result.error) setError(result.error);
          })
        }
      >
        {open ? <Check className="size-3.5" /> : <RotateCcw className="size-3.5" />}
      </Button>
      {error && <span className="text-[11px] text-destructive">{t(error)}</span>}
    </div>
  );
}

/** فرمِ نوشتن — کامنتِ تازه (بی‌والد) یا پاسخ (با `parentId`). */
function Composer({
  projectId,
  parentId,
  placeholder,
  buttonLabel,
  rows,
  onDone,
}: {
  projectId: number;
  parentId: number | null;
  placeholder: string;
  buttonLabel: string;
  rows: number;
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState<TabActionState, FormData>(async (prev, data) => {
    const result = await addCommentAction(prev, data);
    if (result.ok) onDone?.();
    return result;
  }, {});
  useActionToast(state, { success: 'ثبت شد.' });
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      {parentId !== null && <input type="hidden" name="parentId" value={parentId} />}
      <Textarea name="body" rows={rows} required placeholder={placeholder} />
      <div className="flex justify-end"><SendButton label={buttonLabel} /></div>
    </form>
  );
}

/** یک پیامِ رشته — ریشه یا پاسخ؛ نشان و کنترل‌ها فقط روی تازه‌ترین پیام. */
function Node({
  comment,
  thread,
  projectId,
  canManage,
  canInteract,
  isFrozen,
  depth,
}: {
  comment: ThreadItem;
  thread: Thread<ThreadItem>;
  projectId: number;
  canManage: boolean;
  canInteract: boolean;
  isFrozen: boolean;
  depth: number;
}) {
  const t = useT();
  const tz = useTimeZone();
  const [replying, setReplying] = useState(false);
  const isLatest = comment.id === thread.latest.id;
  const closed = !isOpen(thread.status);
  const hasReplies = thread.replies.some((r) => r.node.parentId === comment.id);

  return (
    /**
     * ⚠️ تودرتوییِ واقعی: پیش از این هر پاسخ — در هر عمقی — همان یک پله
     * تورفتگی می‌گرفت، پس «پاسخ به پاسخ» از «پاسخ به ریشه» قابلِ تشخیص
     * نبود. حالا تورفتگی با عمق زیاد می‌شود (تا چهار پله، وگرنه روی
     * موبایل ستون به صفر می‌رسد) و یک خطِ عمودی رشته را نشان می‌دهد.
     */
    <div
      className={
        depth > 0
          ? 'rounded-md border border-s-2 border-s-primary/40 bg-muted/30 p-3'
          : 'rounded-md border bg-background p-3'
      }
      style={depth > 0 ? { marginInlineStart: Math.min(depth, 4) * 14 } : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {comment.userName ?? '—'} · <span className="num">{when(comment.createdAt, tz)}</span>
          </p>
          {/* «انجام شد توسط X» — فقط روی تازه‌ترین پیام و فقط وقتی واقعاً بسته شده باشد. */}
          {isLatest && closed && comment.closedByName && comment.closedAt && (
            <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              ✓ {t('{label} توسط {name}', {
                label: statusLabel(comment.type as CommentType, comment.status),
                name: comment.closedByName,
              })} ·{' '}
              <span className="num">{when(comment.closedAt, tz)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isLatest && <StatusToggle comment={comment} canToggle={canInteract && !isFrozen} />}
          {canManage && !isFrozen && <CommentDelete commentId={comment.id} hasReplies={hasReplies} />}
        </div>
      </div>

      {/* پاسخ — روی تازه‌ترین پیام و فقط وقتی پروژه منجمد نیست (پورتِ افزونه). */}
      {isLatest && canInteract && !isFrozen && (
        <div className="mt-2">
          {replying ? (
            <Composer
              projectId={projectId}
              parentId={comment.id}
              placeholder={t('پاسخ شما…')}
              buttonLabel={t('ارسال پاسخ')}
              rows={2}
              onDone={() => setReplying(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setReplying(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Reply className="size-3.5" />
              {t('پاسخ')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** یک رشته (کامنت یا بازبینی) — زیرتب‌های وضعیت، رشته‌ها با پاسخ‌هایشان، و فرمِ خودش. */
function ThreadList({
  projectId,
  comments,
  canManage,
  canInteract,
  isFrozen,
}: {
  projectId: number;
  comments: CommentItem[];
  canManage: boolean;
  canInteract: boolean;
  isFrozen: boolean;
}) {
  const t = useT();

  /**
   * پورتِ `render_thread`: رشته‌ها با وضعیتِ **تازه‌ترین** پیامشان به دو
   * سطلِ «نیازمند بررسی» / «انجام‌شده» می‌روند؛ تازه‌ترین رشته اول.
   */
  const { open, closed } = buildThreads<ThreadItem>(
    comments.map((c) => ({ ...c, parentId: c.parentId ?? null })),
  );
  const [bucket, setBucket] = useState<'open' | 'closed'>(open.length > 0 || closed.length === 0 ? 'open' : 'closed');
  const list = bucket === 'open' ? open : closed;

  return (
    <div className="grid gap-3">
      {/* پورتِ افزونه: روی پروژهٔ منجمد فرمِ نوشتن اصلاً نیست. */}
      {canInteract && !isFrozen && (
        <Composer
          projectId={projectId}
          parentId={null}
          placeholder={t("دیدگاه خود را بنویسید…")}
          buttonLabel={t('ارسال کامنت')}
          rows={3}
        />
      )}

      <nav className="flex flex-wrap gap-1 border-b pb-2">
        {(['open', 'closed'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setBucket(key)}
            className={`flex items-center gap-2 rounded-md px-3 py-1 text-sm ${bucket === key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60'}`}
          >
            {key === 'open' ? t('نیازمند بررسی') : t('انجام‌شده')}
            {/* عدد نشانِ جداست، نه ادامهٔ کلمه — در راست‌به‌چپ می‌چسبید. */}
            <span className="num rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
              {key === 'open' ? open.length : closed.length}
            </span>
          </button>
        ))}
      </nav>

      {list.length === 0 ? (
        <EmptyState title={bucket === 'open' ? t("موردی برای بررسی نیست.") : t("موردی نیست.")} />
      ) : (
        // ⚠️ فاصلهٔ بیشتر بینِ رشته‌ها از فاصلهٔ داخلِ یک رشته: مرزِ دو گفتگو
        // باید از مرزِ دو پیامِ یک گفتگو پررنگ‌تر باشد.
        <ul className="grid gap-5">
          {list.map((thread) => (
            <li key={thread.root.id} className="grid gap-2 rounded-lg border border-dashed p-3">
              <Node
                comment={thread.root}
                thread={thread}
                projectId={projectId}
                  canManage={canManage}
                canInteract={canInteract}
                isFrozen={isFrozen}
                depth={0}
              />
              {thread.replies.map((r) => (
                <Node
                  key={r.node.id}
                  comment={r.node}
                  thread={thread}
                  projectId={projectId}
                      canManage={canManage}
                  canInteract={canInteract}
                  isFrozen={isFrozen}
                  depth={r.depth}
                />
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * تبِ کامنت‌ها — **یک** رشته، با پاسخ‌های تودرتو؛ وضعیتِ هر رشته از تازه‌ترین
 * پیامش می‌آید و هر شرکت‌کننده می‌تواند آن را عوض کند.
 *
 * ⚠️ رشتهٔ دومِ «بازبینی» برداشته شد (مهاجرتِ 0026). مکانیزمش با کامنت مو
 * نمی‌زد و تنها تفاوتش نامِ حالتِ بسته بود؛ در عوض هیچ شمارنده‌ای آن را
 * نمی‌دید — داشبورد صریحاً `type='comment'` فیلتر می‌کرد و کارتِ «کامنت باز»
 * ِ پروژه بازبینیِ **حل‌شده** را باز حساب می‌کرد. یک جا برای گفت‌وگو، و
 * تسک برای کار.
 */
export function CommentsTab({
  projectId,
  comments,
  canManage,
  canInteract,
  isFrozen = false,
}: {
  projectId: number;
  comments: CommentItem[];
  canManage: boolean;
  /** هر شرکت‌کننده (عضو/کارفرما) تیکِ «انجام شد» می‌زند — پورتِ `handle_comment_status`. */
  canInteract: boolean;
  isFrozen?: boolean;
}) {
  return (
    <div className="grid max-w-4xl gap-4">
      <ThreadList
        projectId={projectId}
        comments={comments}
        canManage={canManage}
        canInteract={canInteract}
        isFrozen={isFrozen}
      />
    </div>
  );
}
