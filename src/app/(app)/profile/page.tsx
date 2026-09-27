import { redirect } from 'next/navigation';
import { can } from '@/domain/access/permissions';
import { currentActor } from '@/server/auth';
import { getAccountInfo, getCompany, getMyProfile } from '@/server/people/profile-service';
import { myGrants } from '@/server/access/service';
import { ProfileView } from './profile-view';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell } from '@/components/page-shell';

/** پروفایلِ من — هر کاربرِ واردشده‌ای دارد؛ مجوزِ خاصی لازم نیست. */
export default async function ProfilePage() {
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

  /**
   * ⚠️ تبِ «مشخصات شرکت» با `settings.manage` باز می‌شود، نه فقط مالک —
   * حسابدارِ نسخهٔ قبلی هم این تب را داشت (زیرِ).
   */
  const isOwner = can(actor, 'settings.manage');
  const [me, company, account, myAccess] = await Promise.all([
    getMyProfile(actor),
    // مشخصاتِ شرکت فقط برای مالک خوانده می‌شود.
    isOwner ? getCompany() : Promise.resolve(null),
    getAccountInfo(actor),
    // دسترسی‌های بیرونیِ خودم — بی‌مجوزِ خاص، چون دادهٔ خودِ کاربر است.
    myGrants(actor),
  ]);

  return (
    <PageShell>
      <PageHeader
        title={t("پروفایلِ من")}
        description={(
          <>{me.name} · {me.email}</>
        )}
      />

      <ProfileView
        data={{
          id: actor.id,
          name: me.name,
          email: me.email,
          phone: account.phone,
          username: account.username,
          avatarFileId: account.avatarFileId,
          timezone: me.timezone,
          bank: me.bank,
          hasBank: me.hasBank,
          telegram: me.telegram,
          notify: me.notify,
          myAccess,
          isOwner,
          company: company ?? {
            name: '', address: '', taxId: '', email: '',
            phone: '', website: '', bank: '', invoiceFooter: '', logoFileId: null,
          },
        }}
      />
    </PageShell>
  );
}
