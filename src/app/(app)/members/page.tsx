import { PeopleSectionPage } from '../_people/section-page';
import { t } from '@/i18n/server';

/** اعضای تیم — معادلِ `Members_Page`: تگ، دفتر و off-boarding همه روشن. */
export default function MembersPage() {
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
