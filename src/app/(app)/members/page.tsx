import { PeopleSectionPage } from '../_people/section-page';
import { primeTranslations, t } from '@/i18n/server';

/** اعضای تیم — معادلِ `Members_Page`: تگ، دفتر و off-boarding همه روشن. */
/**
 * ⚠️ async و prime ِ صریح، هرچند این صفحه داده‌ای نمی‌خواند: چیدمان و صفحه
 * در App Router **موازی** رندر می‌شوند، پس `t()` ِ یک صفحهٔ همگام پیش از
 * پرشدنِ ظرفِ ترجمه اجرا می‌شود و همیشه فارسی برمی‌گرداند — حتی وقتی بقیهٔ
 * اپ انگلیسی است. صفحه‌های دیگر تصادفاً سالم‌اند چون منتظرِ داده می‌مانند.
 */
export default async function MembersPage() {
  await primeTranslations();

  return (
    <PeopleSectionPage
      section={{
        role: 'member',
        title: t("اعضای تیم"),
        addLabel: 'افزودن عضو',
        editLabel: 'ویرایش عضو',
        supportsTags: true,
        supportsOffices: true,
        supportsOffboarding: true,
      }}
    />
  );
}
