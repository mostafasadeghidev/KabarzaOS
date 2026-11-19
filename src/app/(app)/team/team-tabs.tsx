'use client';

import { useRouter } from 'next/navigation';
import { OverflowTabs } from '@/components/ui/overflow-tabs';
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
    <div data-tour="team-tabs">
      {/* ۳.۱۵.۱ — OverflowTabs: روی گوشی تبِ آخر نیمه‌بریده دیده می‌شد («ترجی…»)؛ حالا اضافه‌ها زیرِ «بیشتر» می‌روند. */}
      <OverflowTabs
        tour="team-tab"
        className="pb-1.5"
        variant="line"
        value={tab}
        onValueChange={(v) => router.push(`/team?tab=${v}`)}
        items={TEAM_TABS.map((key) => ({ value: key, label: tr(LABELS[key]) }))}
      />
    </div>
  );
}
