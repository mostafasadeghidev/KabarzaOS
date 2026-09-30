import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { listPeople } from '@/server/people/service';
import { getSystemConfig } from '@/server/settings/system-service';
import { canSeeScope, ForbiddenError } from '@/domain/access/guard';
import { EmptyState } from '@/components/ui/empty-state';
import { PeopleGrid } from './people-grid';
import type { SectionConfig } from './person-card';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell } from '@/components/page-shell';

/**
 * صفحهٔ پایهٔ افراد — همان نقشی که در نسخهٔ قبلی دارد.
 * «اعضا» و «کارفرمایان» فقط پیکربندیِ متفاوتی به آن می‌دهند (R-PEOPLE-04).
 */
export async function PeopleSectionPage({ section }: { section: SectionConfig }) {
  /**
   * ⚠️ هر صفحه **خودش** ترجمه را آماده می‌کند و به چیدمان تکیه نمی‌کند:
   * در ناوبریِ سمتِ کلاینت، Next فقط بخشِ صفحه را دوباره رندر می‌کند و
   * چیدمان را از درختِ کش‌شده برمی‌دارد — پس `primeTranslations()` ِ
   * چیدمان اجرا نمی‌شود و `t()` رشتهٔ فارسیِ مبدأ را برمی‌گرداند.
   * `cache()` تضمین می‌کند در هر درخواست فقط یک بار اجرا شود.
   */
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  let data;
  try {
    data = await listPeople(actor, section.role);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader title={t(section.title)} />
          <EmptyState
            title={t("دسترسی ندارید")}
            description={t('برای دیدنِ {section} از مدیر دسترسی بگیرید.', {
              section: section.title,
            })}
          />
        </PageShell>
      );
    }
    throw error;
  }

  // بدونِ off-boarding، «فعال» یعنی همه.
  const activeCount = section.supportsOffboarding
    ? data.people.filter((p) => p.memberState === 'active').length
    : data.people.length;

  return (
    <PageShell>
      <PageHeader
        title={t(section.title)}
        description={(
          <><span className="num">{activeCount}</span>{' '}
          {section.role === 'member' ? t('عضوِ فعال') : t('کارفرما')}</>
        )}
      />

      <PeopleGrid
        people={data.people}
        offices={data.offices}
        options={{
          roleTags: data.roleTags,
          offices: data.offices,
          candidates: data.candidates,
          // ⚠️ فقط کسی که خودش دیدِ خصوصی دارد می‌تواند بدهدش.
          canGrantPrivate: canSeeScope(actor, 'private'),
        }}
        section={{
          ...section,
          onboarding: section.role === 'member' && (await getSystemConfig()).onboardingEnabled,
        }}
        canManage={data.canManage}
        canViewReports={data.canViewReports}
        isOwner={data.isOwner}
      />
    </PageShell>
  );
}
