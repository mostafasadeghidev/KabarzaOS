import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import {
  canCreateProjects, getCardOptions, getProjectFormOptions, getStatusOptions, listProjects,
} from '@/server/projects/service';
import { ForbiddenError } from '@/domain/access/guard';
import { canManageSection, canViewSection } from '@/domain/access/permissions';
import { activeTab, buildTabs } from '@/domain/projects/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { ProjectGrid } from './project-grid';
import { ProjectDialog } from './_form/project-dialog';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell } from '@/components/page-shell';

/**
 * نمای کارتِ پروژه‌ها — ساختار از نسخهٔ قبلی:
 * سرصفحه + دکمهٔ افزودن ← تب‌های وضعیت با شمارنده ← جستجو ← شبکهٔ کارت
 *
 * ⚠️ تب‌ها روی **سرور** ساخته می‌شوند تا صفحه از فریمِ اول روی تبِ درست
 * بیاید — بدونِ پرشِ لحظه‌ایِ تبِ پیش‌فرض.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
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

  let projects;
  try {
    projects = await listProjects(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return (
        <PageShell>
          <PageHeader title={t("پروژه‌ها")} />
          <EmptyState title={t("دسترسی ندارید")} description={t("برای دیدنِ پروژه‌ها از مدیر دسترسی بگیرید.")} />
        </PageShell>
      );
    }
    throw error;
  }

  const requested = (await searchParams).tab ?? null;
  const tabs = buildTabs(projects, requested);
  const canManage = canManageSection(actor, 'projects');

  /**
   * گزینه‌های فرم فقط وقتی خوانده می‌شوند که دکمه‌اش هم دیده شود.
   * ⚠️ مدیرِ دفتر بی‌مجوزِ سراسری هم فرمِ ساخت دارد (فقط دفاترِ خودش)، ولی
   * کارتِ قابلِ ویرایش نه — `cardOptions` همچنان فقط برای مدیرِ سراسری است.
   */
  const [formOptions, cardOptions] = canManage
    ? await Promise.all([getProjectFormOptions(actor), getCardOptions(actor)])
    : [await canCreateProjects(actor) ? await getProjectFormOptions(actor) : null, null];

  /**
   * وضعیت‌ها فقط خوراکِ منوی چیپِ **قابلِ تغییر**اند و آن منو فقط برای مدیر
   * رندر می‌شود؛ چیپِ خواندنی نام/گروه را از خودِ ردیف دارد.
   * ⚠️ برای عضو/کارفرما اصلاً صدا نمی‌زنیم — `getStatusOptions` مجوزِ بخش
   * می‌خواهد و صدازدنِ بی‌قیدش همین‌جا صفحهٔ عضو را می‌انداخت.
   */
  const statuses = (formOptions?.statuses
    ?? (canViewSection(actor, 'projects') ? await getStatusOptions(actor) : [])
  ).map((s) => ({
    id: s.id,
    name: s.name,
    group: s.group,
    color: s.color,
  }));

  const header = {
    title: t("پروژه‌ها"),
    description: (
      <><span className="num">{projects.filter((p) => !p.isArchived).length}</span> {t("پروژهٔ فعال")}</>
    ),
    // R-RBAC-06 — دکمهٔ تغییر فقط برای مدیر (سرویس هم مستقل گارد دارد).
    actions: formOptions && (
      <ProjectDialog
        options={{
          statuses: formOptions.statuses.map((s) => ({ id: s.id, label: s.name })),
          currencies: formOptions.currencies.map((c) => ({ id: c.id, label: c.code })),
          offices: formOptions.offices.map((o) => ({ id: o.id, label: o.name })),
          parents: formOptions.parents.map((p) => ({ id: p.id, label: p.title })),
          defaultCurrencyId: formOptions.currencies.find((c) => c.isDefault)?.id ?? null,
          roleTags: formOptions.roleTags,
          canUsePrivate: formOptions.canUsePrivate,
          officeRequired: formOptions.officeRequired,
          canEditMoney: formOptions.canSetMoney,
          today: new Date().toISOString().slice(0, 10),
          // بخش‌های اولیه فقط در همین فرمِ ساخت لازم‌اند.
          bootstrap: {
            people: formOptions.people.map((p) => ({ value: p.id, label: p.name })),
            clients: formOptions.clientPeople.map((c) => ({ value: c.id, label: c.name })),
            memberRoles: formOptions.memberRoles,
            roleTags: formOptions.roleTags,
            priorities: formOptions.priorities.map((p) => ({ id: p.id, label: p.name })),
            currencies: formOptions.currencies.map((c) => ({ id: c.id, label: c.code })),
            defaultCurrencyId: formOptions.currencies.find((c) => c.isDefault)?.id ?? null,
            hasQaLibrary: formOptions.hasQaLibrary,
            qaItems: formOptions.qaItems,
          },
        }}
      />
    ),
  };

  return (
    <PageShell>
      {/* ⚠️ سرصفحه را شبکه می‌کشد (جستجو کنارِ دکمهٔ اصلی)؛ حالتِ خالی جستجو ندارد. */}
      {projects.length === 0 ? (
        <>
          <PageHeader {...header} />
          <EmptyState title={t("پروژه‌ای ثبت نشده")} description={t("اولین پروژه را بسازید تا اینجا دیده شود.")} />
        </>
      ) : (
        <ProjectGrid
          header={header}
          projects={projects}
          tabs={tabs}
          initialTab={activeTab(tabs)}
          today={new Date().toISOString().slice(0, 10)}
          statuses={statuses}
          cardOptions={cardOptions}
        />
      )}
    </PageShell>
  );
}
