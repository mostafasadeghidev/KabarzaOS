import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { canViewSection } from '@/domain/access/permissions';

/** صفحهٔ اصلی — به اولین بخشی که کاربر اجازه دارد هدایت می‌کند. */
export default async function Home() {
  const actor = await currentActor();
  if (!actor) redirect('/login');

  if (canViewSection(actor, 'projects')) redirect('/dashboard');
  if (canViewSection(actor, 'reports')) redirect('/reports');
  /**
   * ⚠️ عضو و کارفرما هیچ مجوزِ بخشی ندارند — دیدشان عضویت‌محور است.
   * پیش از این، این خط به `/login` می‌فرستادشان: لاگینِ موفق دوباره به
   * فرمِ ورود برمی‌گشت و **هیچ عضوی نمی‌توانست واردِ اپ شود**.
   */
  if (actor.roles.includes('member') || actor.roles.includes('client')) redirect('/projects');
  redirect('/login');
}
