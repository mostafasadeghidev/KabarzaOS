import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { firstPage } from '@/domain/access/first-page';

/**
 * صفحهٔ اصلی — به اولین بخشی که کاربر اجازه دارد هدایت می‌کند.
 *
 * ⚠️ قاعده در `domain/access/first-page` است و تست دارد. پیش از این اینجا
 * فقط پروژه‌ها، گزارش‌ها و نقشِ عضو/کارفرما شناخته می‌شد و بقیه — همکارِ
 * ادمینی که فقط اعضا/جلسات/پیام/مالی دارد — به `/login` می‌رفتند، که خودش
 * به `/` برمی‌گرداند: بن‌بست.
 */
export default async function Home() {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  redirect(firstPage(actor));
}
