import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth';
import { channelFormOptions, getRecipientFilterData, getRecipients, listInbox } from '@/server/messaging/service';
import { can } from '@/domain/access/permissions';
import { getSystemConfig } from '@/server/settings/system-service';
import { MessagesView } from './messages-view';
import { PageShell } from '@/components/page-shell';
import { primeTranslations, t } from '@/i18n/server';

/**
 * پیام‌ها — صندوقِ **شخصی**.
 * ⚠️ گاردی برای «دیدنِ بخش» لازم نیست: صندوق از `thread_users` ِ خودِ کاربر
 * ساخته می‌شود، پس کسی که رشته‌ای ندارد چیزی هم نمی‌بیند (R-MSG-02).
 */
/**
 * صفحهٔ پیام‌ها — بدنهٔ مشترکِ `/messages` و `/messages/{id}`.
 *
 * ⚠️ چرا مشترک و نه دو پیاده‌سازی: مسیرِ دومی فقط برای این هست که لینکِ
 * اعلانِ پیام (`/messages/{threadId}`) به جایی برسد. اگر دو نسخه می‌شد،
 * هر تغییری در صندوق باید دو بار انجام می‌شد و یکی‌شان عقب می‌ماند.
 */
export async function MessagesScreen({ threadId = null }: { threadId?: number | null }) {
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

  const [inbox, system] = await Promise.all([listInbox(actor), getSystemConfig()]);
  // ⚠️ فقط وقتی خوانده می‌شوند که کاربر واقعاً بتواند پیام بفرستد.
  const [recipients, filters] = inbox.canSend
    ? await Promise.all([getRecipients(actor), getRecipientFilterData(actor)])
    : [[], { offices: [], projects: [], officeMembers: {} }];
  const canBroadcast = actor.roles.includes('owner') || actor.roles.includes('admin');
  // «کانالِ تازه» همان گاردِ پخشِ همگانی را دارد: فقط مالک و ادمین.
  const channelOptions = canBroadcast ? await channelFormOptions(actor) : null;

  // ⚠️ گروهِ بی‌صدا در شمارِ «خوانده‌نشده» ِ سرصفحه نیست — همان قاعدهٔ شمارندهٔ سایدبار.
  const unread = inbox.threads.reduce((sum, t) => sum + (t.muted ? 0 : t.unread), 0);

  return (
    /*
      ⚠️ ارتفاعِ ثابت (پنجره منهای نوارِ بالای اپ): صندوق و گفتگو باید هر کدام
      خودشان اسکرول بخورند، نه کلِ صفحه — وگرنه گفتگوی بلند کادرِ پاسخ را
      از دیدرس بیرون می‌برد.
    */
    <PageShell className="h-[calc(100svh-3rem)] min-h-[32rem] flex-none">
      <MessagesView
        header={{
          title: t("پیام‌ها"),
          description: (
            <>
              <p>
                <span className="num">{inbox.threads.length}</span> {t("گفتگو")}
                {unread > 0 && <> · <span className="num">{unread}</span> {t("خوانده‌نشده")}</>}
              </p>
              {/*
                ⚠️ اگر پاک‌سازیِ خودکار روشن است کاربر باید **بداند**؛ پیامی که
                بی‌خبر ناپدید شود شبیهِ باگ است، نه سیاست. صفر یعنی هرگز و
                آن‌وقت هیچ جمله‌ای چاپ نمی‌شود.
              */}
              {system.msgPurgeDays > 0 && (
                <p className="mt-0.5 text-xs">
                  {/* ⚠️ یک جملهٔ پارامتری، نه سه تکه: در زبانِ دیگر ترتیبِ
                      تکه‌ها عوض می‌شود و جمله بی‌معنا از آب درمی‌آید. */}
                  {t('پیام‌ها پس از {days} روز به‌صورت خودکار پاک می‌شوند.', {
                    days: system.msgPurgeDays,
                  })}
                </p>
              )}
            </>
          ),
        }}
        inbox={inbox.threads}
        recipients={recipients}
        filters={filters}
        canSend={inbox.canSend}
        poll={{ enabled: system.chatPollEnabled, seconds: system.chatPollInterval }}
        canBroadcast={canBroadcast}
        channelOptions={channelOptions}
        initialThreadId={threadId}
        viewerId={actor.id}
      />
    </PageShell>
  );
}
