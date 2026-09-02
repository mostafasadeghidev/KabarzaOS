'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import {
  addCommentAction, deleteCommentAction, toggleCommentAction, type TabActionState,
} from '../_form/tab-actions';
import { isOpen, statusLabel, type CommentType } from '@/domain/projects/comments';
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
}

function when(value: Date | string | null | undefined, tz: string): string {
  return formatDateTime(value, tz);
}

function SendButton() {
  const { pending } = useFormStatus();
  const tr = useT();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? tr('در حال ارسال…') : tr('ارسال')}
    </Button>
  );
}

function CommentDelete({ commentId }: { commentId: number }) {
  const t = useT();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={t("حذفِ کامنت")}
      disabled={pending}
      onClick={async () => {
        if (await confirm({ title: t('این کامنت حذف شود؟') })) {
          startTransition(async () => { await deleteCommentAction(commentId); });
        }
      }}
      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-60"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

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

/** یک رشته (کامنت یا بازبینی) — فهرست با زیرتب‌های وضعیت و فرمِ خودش. */
function Thread({
  projectId,
  type,
  comments,
  canManage,
  canInteract,
  isFrozen,
}: {
  projectId: number;
  type: 'comment' | 'review';
  comments: CommentItem[];
  canManage: boolean;
  canInteract: boolean;
  isFrozen: boolean;
}) {
  const t = useT();
  const tz = useTimeZone();
  const [state, formAction] = useActionState<TabActionState, FormData>(addCommentAction, {});
  useActionToast(state, { success: 'ثبت شد.' });

  /**
   * پورتِ زیرتب‌های رشته: «نیازمند بررسی (n)» / «انجام‌شده ∕ حل‌شده (n)»؛
   * تازه‌ترین اول (پیش از این کهنه‌ترین اول بود).
   */
  const openOnes = comments.filter((c) => isOpen(c.status));
  const closedOnes = comments.filter((c) => !isOpen(c.status));
  const [bucket, setBucket] = useState<'open' | 'closed'>(openOnes.length > 0 || closedOnes.length === 0 ? 'open' : 'closed');
  const list = (bucket === 'open' ? openOnes : closedOnes).slice().sort((a, b) => b.id - a.id);
  const closedLabel = type === 'review' ? 'حل‌شده' : 'انجام‌شده';

  return (
    <div className="grid gap-3">
      <nav className="flex flex-wrap gap-1 border-b pb-2">
        {(['open', 'closed'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setBucket(key)}
            className={`rounded-md px-3 py-1 text-sm ${bucket === key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60'}`}
          >
            {key === 'open' ? t('نیازمند بررسی') : t(closedLabel)}
            <span className="num ms-1 text-xs text-muted-foreground">{key === 'open' ? openOnes.length : closedOnes.length}</span>
          </button>
        ))}
      </nav>

      {list.length === 0 ? (
        <EmptyState title={type === 'review' ? t("بازبینی‌ای در این وضعیت نیست") : t("کامنتی در این وضعیت نیست")} />
      ) : (
        <ul className="grid gap-2">
          {list.map((c) => (
            <li key={c.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.userName ?? '—'} · <span className="num">{when(c.createdAt, tz)}</span>
                  </p>
                  {/* «انجام شد توسط X» — فقط وقتی واقعاً بسته شده باشد. */}
                  {c.closedByName && c.closedAt && (
                    <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                      {t('{label} توسط {name}', {
                        label: statusLabel(c.type as CommentType, c.status),
                        name: c.closedByName,
                      })} ·{' '}
                      <span className="num">{when(c.closedAt, tz)}</span>
                    </p>
                  )}
                </div>
                {/* تغییرِ وضعیت روی پروژهٔ منجمد بسته است (`block_if_frozen`). */}
                <StatusToggle comment={c} canToggle={canInteract && !isFrozen} />
                {canManage && !isFrozen && <CommentDelete commentId={c.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* پورتِ افزونه: روی پروژهٔ منجمد فرمِ نوشتن اصلاً نیست. */}
      {canInteract && !isFrozen && (
        <form action={formAction} className="grid gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="type" value={type} />
          <Textarea
            name="body" rows={2} required
            placeholder={type === 'review' ? t("درخواستِ بازبینی یا نتیجهٔ بازبینی را بنویسید…") : t("یادداشت/توضیح بنویسید…")}
          />
          <div className="flex justify-end"><SendButton /></div>
        </form>
      )}
    </div>
  );
}

/**
 * تبِ کامنت‌ها — پورتِ `render_thread($type)`: دو رشتهٔ جدا («کامنت‌ها» و
 * «بازبینی‌ها») با برچسب‌ها و فرمِ خودشان؛ هر شرکت‌کننده وضعیت را عوض می‌کند.
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
  const t = useT();
  const [thread, setThread] = useState<'comment' | 'review'>('comment');
  const ofType = (type: string) => comments.filter((c) => c.type === type);

  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-1">
        {(['comment', 'review'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setThread(key)}
            className={`rounded-full border px-3 py-1 text-sm ${thread === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {key === 'comment' ? t('کامنت‌ها') : t('بازبینی‌ها')}
            <span className="num ms-1 text-xs">{ofType(key).length}</span>
          </button>
        ))}
      </nav>
      <Thread
        key={thread}
        projectId={projectId}
        type={thread}
        comments={ofType(thread)}
        canManage={canManage}
        canInteract={canInteract}
        isFrozen={isFrozen}
      />
    </div>
  );
}
