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
import { useT } from '@/i18n/client';

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

/** تاریخِ کوتاه — همیشه چپ‌به‌راست تا در متنِ فارسی نشکند. */
function when(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toISOString().slice(0, 16).replace('T', ' ');
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

/**
 * حذفِ کامنت — فقط مدیر.
 * ⚠️ نویسندهٔ کامنت هم نمی‌تواند پاکش کند: کامنت بخشی از تاریخچهٔ گفتگوی
 * پروژه است و پاک‌کردنش تصمیمِ مدیریتی است، نه شخصی.
 */
function CommentDelete({ commentId }: { commentId: number }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={t("حذفِ کامنت")}
      disabled={pending}
      onClick={() => startTransition(async () => { await deleteCommentAction(commentId); })}
      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-60"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

function StatusToggle({ comment, canManage }: { comment: CommentItem; canManage: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const open = isOpen(comment.status);
  const label = statusLabel(comment.type as CommentType, comment.status);

  const chip = <Badge variant={open ? 'warning' : 'success'}>{t(label)}</Badge>;
  if (!canManage) return chip;

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

/**
 * تبِ کامنت‌ها — فهرست + تیکِ وضعیت + سطرِ «انجام شد توسط X».
 * ⚠️ نامِ حالتِ بسته با نوعِ رشته فرق می‌کند (R-PROJ-27) — برچسب از دامنه می‌آید.
 */
export function CommentsTab({
  projectId,
  comments,
  canManage,
}: {
  projectId: number;
  comments: CommentItem[];
  canManage: boolean;
}) {
  const t = useT();
  const [state, formAction] = useActionState<TabActionState, FormData>(addCommentAction, {});
  useActionToast(state, { success: 'ثبت شد.' });

  return (
    <div className="grid gap-4">
      {comments.length === 0 ? (
        <EmptyState title={t("هنوز گفتگویی نیست")} />
      ) : (
        <ul className="grid gap-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.userName ?? '—'} · <span className="num">{when(c.createdAt)}</span>
                  </p>
                  {/* «انجام شد توسط X» — فقط وقتی واقعاً بسته شده باشد. */}
                  {c.closedByName && c.closedAt && (
                    <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                      {t('{label} توسط {name}', {
                        label: statusLabel(c.type as CommentType, c.status),
                        name: c.closedByName,
                      })} ·{' '}
                      <span className="num">{when(c.closedAt)}</span>
                    </p>
                  )}
                </div>
                <StatusToggle comment={c} canManage={canManage} />
                {canManage && <CommentDelete commentId={c.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="grid gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <Textarea name="body" rows={2} placeholder={t("یادداشت/توضیح بنویسید…")} required />
        <div className="flex justify-end">
          <SendButton />
        </div>
      </form>
    </div>
  );
}
