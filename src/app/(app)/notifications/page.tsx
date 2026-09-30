import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { listNotificationFeed } from '@/server/notifications/service';
import { primeTranslations, t } from '@/i18n/server';
import { PageHeader, PageShell } from '@/components/page-shell';
import { NotificationFeed, MarkAllReadButton } from './notification-feed';

/**
 * صفحهٔ اعلان‌ها — پورتِ `view_notifications`.
 *
 * ⚠️ چرا لازم بود: زنگوله فقط ۳۰ اعلانِ آخر را نشان می‌دهد؛ هر چیزِ قدیمی‌تر
 * هیچ راهی برای دیده‌شدن نداشت. این‌جا تا ۲۰۰ ردیف، پیش‌فرض فقط خوانده‌نشده‌ها
 * (همان نسخهٔ قبلی) و با یک کلیک همه.
 *
 * `?show=all` — حالت در آدرس است تا برگشتِ مرورگر و رفرش آن را نگه دارد.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await primeTranslations();

  const actor = await currentActor();
  if (!actor) redirect('/login');

  const showAll = (await searchParams).show === 'all';
  const feed = await listNotificationFeed(actor, { showAll });

  return (
    <PageShell>
      <PageHeader
        title={t('اعلان‌ها')}
        description={feed.unread > 0
          ? t('{n} اعلانِ خوانده‌نشده', { n: feed.unread })
          : t('همهٔ اعلان‌ها خوانده شده‌اند.')}
        actions={feed.unread > 0 ? <MarkAllReadButton /> : undefined}
      />
      <NotificationFeed items={feed.items} showAll={showAll} />
    </PageShell>
  );
}
