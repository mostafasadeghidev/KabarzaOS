import { redirect } from 'next/navigation';
import { can } from '@/domain/access/permissions';
import { currentActor } from '@/server/auth';
import { getCompany, getMyProfile } from '@/server/people/profile-service';
import { ProfileView } from './profile-view';
import { primeTranslations, t } from '@/i18n/server';

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
  const [me, company] = await Promise.all([
    getMyProfile(actor),
    // مشخصاتِ شرکت فقط برای مالک خوانده می‌شود.
    isOwner ? getCompany() : Promise.resolve(null),
  ]);

  return (
    <main className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("پروفایلِ من")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{me.name} · {me.email}</p>
      </header>

      <ProfileView
        data={{
          name: me.name,
          email: me.email,
          timezone: me.timezone,
          bank: me.bank,
          hasBank: me.hasBank,
          telegram: me.telegram,
          notify: me.notify,
          isOwner,
          company: company ?? {
            name: '', address: '', taxId: '', email: '',
            phone: '', website: '', bank: '', invoiceFooter: '', logoFileId: null,
          },
        }}
      />
    </main>
  );
}
