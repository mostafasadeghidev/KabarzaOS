import { PeopleSectionPage } from '../_people/section-page';
import { t } from '@/i18n/server';

/**
 * کارفرمایان.
 * ⚠️ سه پرچمِ تگ/دفتر/off-boarding **خاموش**اند، دقیقاً مثلِ نسخهٔ قبلی که
 * هیچ‌کدام را override نمی‌کند و پیش‌فرضِ false می‌گیرد.
 */
export default function ClientsPage() {
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
