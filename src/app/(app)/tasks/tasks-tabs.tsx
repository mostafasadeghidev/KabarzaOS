'use client';

import { useState } from 'react';
import { Inbox, Plus } from 'lucide-react';
import { QuickTaskForm } from './quick-task';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * دو نمای صفحهٔ «تسک‌ها»:
 *  · **صندوقِ من** — آنچه به من سپرده شده و آنچه منتظرِ بررسیِ من است.
 *  · **افزودنِ سریع** — تسک زدن روی هر پروژه، بدونِ بازکردنِ آن.
 *
 * ⚠️ تب سمتِ کلاینت است و صندوق روی سرور رندر شده و به‌عنوان `children`
 * می‌آید: نگه‌داشتنِ آن روی سرور یعنی صفحه بدونِ رفت‌وبرگشتِ اضافه می‌آید و
 * ماسکِ نام/خصوصی‌بودن همان‌جا اعمال می‌ماند.
 */
export function TasksTabs({
  inbox,
  inboxCount,
  projects,
  today,
}: {
  inbox: React.ReactNode;
  inboxCount: number;
  projects: Array<{ id: number; title: string }>;
  today: string;
}) {
  const tr = useT();
  const [tab, setTab] = useState<'inbox' | 'quick'>('inbox');

  const item = (key: 'inbox' | 'quick', label: string, icon: React.ReactNode, count?: number) => (
    <TabsTrigger key={key} value={key} className="flex-none px-3">
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <Badge variant="secondary" className="num px-1.5 py-0 text-[10px]">{count}</Badge>
      )}
    </TabsTrigger>
  );

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          {item('inbox', tr('سپرده‌شده به من'), <Inbox className="size-3.5" />, inboxCount)}
          {item('quick', tr('افزودنِ سریع'), <Plus className="size-3.5" />)}
        </TabsList>
      </Tabs>

      <div className={tab === 'inbox' ? 'contents' : 'hidden'}>{inbox}</div>
      {tab === 'quick' && <QuickTaskForm projects={projects} today={today} />}
    </>
  );
}
