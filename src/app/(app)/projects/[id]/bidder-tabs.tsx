'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/i18n/client';
import type { BidderTab } from '@/domain/projects/tabs';

const LABELS: Record<BidderTab, string> = {
  tender: 'مناقصه',
  about: 'توضیحات',
  tasks: 'تسک‌ها',
  files: 'فایل‌ها',
};

/**
 * نوارِ تبِ نمای مناقصه‌گر. ⚠️ هر تب یک **آدرس** است (`?tab=`) تا لینکِ
 * مستقیم و رفرش همان تب را باز کند — مثلِ تب‌های صفحهٔ پروژه.
 */
export function BidderTabs({ tab, tabs, counts }: {
  tab: BidderTab;
  tabs: readonly BidderTab[];
  counts: Partial<Record<BidderTab, number>>;
}) {
  const tr = useT();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })}>
      <div className="overflow-x-auto pb-1.5">
        <TabsList variant="line" className="w-max">
          {tabs.map((key) => (
            <TabsTrigger key={key} value={key} className="flex-none">
              {tr(LABELS[key])}
              {counts[key] !== undefined && (
                <span className="num text-xs text-muted-foreground">{counts[key]}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
