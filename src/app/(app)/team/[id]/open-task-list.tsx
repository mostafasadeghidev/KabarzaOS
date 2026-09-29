'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Item, ItemContent, ItemDescription, ItemGroup } from '@/components/ui/item';
import { useT } from '@/i18n/client';
import { TaskDialog } from '../../projects/[id]/task-dialog';
import { TaskTitleButton } from '../task-board';

/** تسک‌های بازِ عضو روی پروفایل — عنوان مودالِ تسک را باز می‌کند (همان بردِ تیم). */
export function OpenTaskList({
  tasks,
}: {
  tasks: Array<{ id: number; title: string; projectTitle: string | null; dueDate: string | null }>;
}) {
  const tr = useT();
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">{tr('تسکِ بازی ندارد.')}</p>;
  return (
    <>
      <ItemGroup className="gap-1.5">
        {tasks.map((task) => (
          <Item key={task.id} variant="outline" size="sm" className="px-3 py-2">
            <ItemContent className="flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <TaskTitleButton task={task} onOpen={setOpenId} />
              <ItemDescription className="text-xs">
                {task.projectTitle}
                {task.dueDate && <span className="num ms-2">{task.dueDate}</span>}
              </ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
      <TaskDialog
        taskId={openId}
        open={openId !== null}
        onOpenChange={(open) => { if (!open) { setOpenId(null); router.refresh(); } }}
      />
    </>
  );
}
