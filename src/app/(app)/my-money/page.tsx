import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { getMyMoney, hasPersonalMoney } from '@/server/finance/my-money';
import { EmptyState } from '@/components/ui/empty-state';
import { MyMoneyView } from './money-view';
import { primeTranslations, t } from '@/i18n/server';

/**
 * «مالیِ من» — صورت‌حسابِ کارفرما و دریافتی‌های عضو، روی همهٔ پروژه‌ها
 * (پورتِ `view_finance()` ِ داشبوردِ نسخهٔ قبلی).
 */
export default async function MyMoneyPage() {
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  /**
   * ⚠️ گاردِ مستقلِ صفحه (R-ARCH-01): پنهان‌بودنِ آیتمِ منو گارد نیست.
   * این صفحه فقط دادهٔ **خودِ** کاربر را نشان می‌دهد، پس مجوزِ مالی لازم
   * ندارد — ولی کسی که نه عضو است نه کارفرما، چیزی برای دیدن ندارد.
   */
  if (!hasPersonalMoney(actor)) {
    return (
      <main className="p-6">
        <EmptyState
          title={t("اطلاعات مالی‌ای برای نمایش نیست")}
          description={t("این صفحه صورت‌حسابِ کارفرما و دریافتی‌های عضوِ تیم را نشان می‌دهد.")}
        />
      </main>
    );
  }

  const data = await getMyMoney(actor);

  return (
    <main className="grid gap-5 p-6">
      <header>
        <h1 className="text-xl font-semibold">{t("امور مالی")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("خلاصهٔ مالیِ شما روی همهٔ پروژه‌ها — برای جزئیاتِ هر پروژه واردِ خودِ پروژه شوید.")}
        </p>
      </header>

      <MyMoneyView
        memberProjects={data.memberProjects}
        clientProjects={data.clientProjects}
        noProjectPayouts={data.noProjectPayouts}
        noProjectIncoming={data.noProjectIncoming}
        isMember={data.isMember}
        isClient={data.isClient}
        bankHref="/profile"
      />
    </main>
  );
}
