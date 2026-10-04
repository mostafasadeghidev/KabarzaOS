'use client';

import { UserName } from '@/components/user-avatar';
import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import { TagChip } from '@/components/ui/tag-chip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useActionToast } from '@/components/ui/toast';
import { useT, useTimeZone } from '@/i18n/client';
import { formatDateTime } from '@/i18n/datetime';
import { addCommentAction, type TabActionState } from '../projects/_form/tab-actions';
import { TaskDialog } from '../projects/[id]/task-dialog';
import { assigneeText, TaskTitleButton, type BoardTask } from './task-board';

/**
 * «تسک‌های نیاز به ریویو» — پورتِ `view_team_review`: جستجوی زنده، عنوان که
 * مودالِ تسک را باز می‌کند، پروژه، تخصیص و وضعیت.
 */
export function ReviewTasks({ tasks }: { tasks: BoardTask[] }) {
  const tr = useT();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  if (tasks.length === 0) return <EmptyState title={tr('موردی برای بررسی نیست.')} />;

  // ⚠️ جستجو روی همهٔ ستون‌های متنیِ ردیف — همان `kteam-live-search` که کلِ ردیف را می‌گشت.
  const needle = q.trim().toLowerCase();
  const list = needle === '' ? tasks : tasks.filter((t) =>
    [t.title, t.projectTitle, assigneeText(t), t.statusName]
      .some((v) => (v ?? '').toLowerCase().includes(needle)));

  return (
    <div className="grid gap-3">
      <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('جستجو')} />
      {list.length === 0 ? <p className="text-sm text-muted-foreground">{tr('موردی پیدا نشد.')}</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('تسک')}</TableHead>
              <TableHead>{tr('پروژه')}</TableHead>
              <TableHead>{tr('تخصیص')}</TableHead>
              <TableHead>{tr('وضعیت')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((task) => (
              <TableRow key={task.id}>
                <TableCell><TaskTitleButton task={task} onOpen={setOpenId} /></TableCell>
                <TableCell>
                  <Link href={`/projects/${task.projectId}`} className="hover:underline">{task.projectTitle ?? '—'}</Link>
                </TableCell>
                <TableCell>{assigneeText(task)}</TableCell>
                <TableCell>
                  {task.statusName ? <TagChip color={task.statusColor}>{task.statusName}</TagChip> : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <TaskDialog
        taskId={openId}
        open={openId !== null}
        onOpenChange={(open) => { if (!open) { setOpenId(null); router.refresh(); } }}
      />
    </div>
  );
}

export interface CommentThread {
  rootId: number;
  id: number;
  projectId: number;
  projectTitle: string;
  authorId?: number | null;
  authorName: string | null;
  createdAt: Date | string;
  excerpt: string;
}

/**
 * «کامنت‌های نیازمند بررسی تیم» — پورتِ `view_team_comments`: آخرین پیامِ هر
 * رشتهٔ باز، پیوند به تبِ کامنت‌های پروژه، و پاسخِ سریع بی‌ترکِ فهرست.
 */
export function CommentThreads({
  threads,
  reply = true,
}: {
  threads: CommentThread[];
  /** پاسخِ سریع — فقط فهرستِ تیمِ مدیرِ دفتر (`view_team_comments`)؛ فهرستِ عضو و کارفرما ندارد. */
  reply?: boolean;
}) {
  const tr = useT();
  const tz = useTimeZone();
  if (threads.length === 0) return <EmptyState title={tr('موردی برای بررسی نیست.')} />;
  return (
    <ItemGroup className="gap-2">
      {threads.map((c) => {
        const href = `/projects/${c.projectId}?tab=comments`;
        return (
          <Item key={c.rootId} variant="outline" size="sm" className="items-start gap-3 p-3">
            <ItemContent className="gap-1.5">
              <ItemTitle className="flex-wrap gap-x-2">
                <UserName userId={c.authorId} name={c.authorName ?? '—'} size="sm" />
                <Link href={href} className="font-normal text-muted-foreground hover:underline">— {c.projectTitle}</Link>
                <span className="num text-xs font-normal text-muted-foreground">{formatDateTime(c.createdAt, tz)}</span>
              </ItemTitle>
              <Link href={href} className="text-sm whitespace-pre-wrap hover:underline">
                {c.excerpt || tr('(بدون متن)')}
              </Link>
              {reply && <QuickReply projectId={c.projectId} parentId={c.rootId} />}
            </ItemContent>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

function ReplyButton() {
  const tr = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Spinner /> : <Send className="rtl:-scale-x-100" />}
      {tr('پاسخ')}
    </Button>
  );
}

/**
 * پاسخِ سریع — همان اقدامِ کامنتِ صفحهٔ پروژه، **زیرِ ریشهٔ همین رشته**.
 * ⚠️ نسخهٔ قبلی کامنتِ تازهٔ جدا می‌ساخت و پاسخ از رشته جدا می‌افتاد؛ این‌جا
 * پاسخ در همان گفت‌وگو می‌نشیند و وضعیتِ رشته را از نو «نیازمند بررسی» می‌کند
 * (قاعدهٔ `addComment`).
 */
function QuickReply({ projectId, parentId }: { projectId: number; parentId: number }) {
  const tr = useT();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<TabActionState, FormData>(addCommentAction, {});
  useActionToast(state, { success: 'پاسخ ثبت شد.' });
  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    router.refresh();
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="parentId" value={parentId} />
      <Input name="body" required placeholder={tr('پاسخ سریع…')} aria-label={tr('پاسخ سریع…')} className="h-8" />
      <ReplyButton />
    </form>
  );
}
