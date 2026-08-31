import { PeopleSectionPage } from '../_people/section-page';
import { primeTranslations, t } from '@/i18n/server';

/**
 * کارفرمایان.
 * ⚠️ سه پرچمِ تگ/دفتر/off-boarding **خاموش**اند، دقیقاً مثلِ نسخهٔ قبلی که
 * هیچ‌کدام را override نمی‌کند و پیش‌فرضِ false می‌گیرد.
 */
/**
 * ⚠️ async و prime ِ صریح، هرچند این صفحه داده‌ای نمی‌خواند: چیدمان و صفحه
 * در App Router **موازی** رندر می‌شوند، پس `t()` ِ یک صفحهٔ همگام پیش از
 * پرشدنِ ظرفِ ترجمه اجرا می‌شود و همیشه فارسی برمی‌گرداند — حتی وقتی بقیهٔ
 * اپ انگلیسی است. صفحه‌های دیگر تصادفاً سالم‌اند چون منتظرِ داده می‌مانند.
 */
export default async function ClientsPage() {
  await primeTranslations();

  return (
    <PeopleSectionPage
      section={{
        role: 'client',
        title: t("کارفرمایان"),
        addLabel: 'افزودن کارفرما',
        editLabel: 'ویرایش کارفرما',
        supportsTags: false,
        supportsOffices: false,
        supportsOffboarding: false,
      }}
    />
  );
}
