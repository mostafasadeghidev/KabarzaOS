import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { listPeople } from '@/server/people/service';
import { ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { PeopleGrid } from './people-grid';
import type { SectionConfig } from './person-card';
import { t } from '@/i18n/server';

/**
 * صفحهٔ پایهٔ افراد — همان نقشی که در نسخهٔ قبلی دارد.
 * «اعضا» و «کارفرمایان» فقط پیکربندیِ متفاوتی به آن می‌دهند (R-PEOPLE-04).
 */
export async function PeopleSectionPage({ section }: { section: SectionConfig }) {
  const actor = await currentActor();
  if (!actor) redirect('/login');

  let data;
  try {
    data = await listPeople(actor, section.role);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <main className="p-6">
          <EmptyState
            title={t("دسترسی ندارید")}
            description={t('برای دیدنِ {section} از مدیر دسترسی بگیرید.', {
              section: section.title,
            })}
          />
        </main>
      );
    }
    throw error;
  }

  // بدونِ off-boarding، «فعال» یعنی همه.
  const activeCount = section.supportsOffboarding
    ? data.people.filter((p) => p.memberState === 'active').length
    : data.people.length;

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{section.title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className="num">{activeCount}</span>{' '}
          {section.role === 'member' ? 'عضو فعال' : 'کارفرما'}
        </p>
      </header>

      <PeopleGrid
        people={data.people}
        offices={data.offices}
        options={{ roleTags: data.roleTags, offices: data.offices, candidates: data.candidates }}
        section={section}
        canManage={data.canManage}
        canViewReports={data.canViewReports}
        isOwner={data.isOwner}
      />
    </main>
  );
}
