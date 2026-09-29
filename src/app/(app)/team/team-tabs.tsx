'use client';

import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT } from '@/i18n/client';
import { TEAM_TABS, type TeamTab } from '@/domain/team/boards';

/** برچسب‌ها — همان عنوانِ صفحه‌های تیمِ نسخهٔ قبلی. */
const LABELS: Record<TeamTab, string> = {
  members: 'اعضا و ساعت کاری',
  projects: 'پروژه‌های تحت مدیریت',
  tasks: 'تسک‌های باز تیم',
  review: 'تسک‌های نیاز به ریویو',
  comments: 'کامنت‌های نیازمند بررسی',
};

/**
 * تب‌های «تیمِ من». ⚠️ هر تب یک **آدرس** است: تعویض، فیلترهای تبِ قبلی را
 * عمداً جا می‌گذارد (فیلترِ تسک روی تبِ اعضا معنا ندارد).
 */
export function TeamTabs({ tab }: { tab: TeamTab }) {
  const tr = useT();
  const router = useRouter();
  return (
    <Tabs value={tab} onValueChange={(v) => router.push(`/team?tab=${v}`)}>
      {/* پیمایشِ افقی به‌جای شکستنِ خط — پنج تب روی موبایل جا نمی‌شوند. */}
      <div className="overflow-x-auto pb-1.5">
        <TabsList variant="line" className="w-max">
          {TEAM_TABS.map((key) => (
            <TabsTrigger key={key} value={key} className="flex-none">
              {tr(LABELS[key])}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
