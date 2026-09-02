import { notFound } from 'next/navigation';
import { MessagesScreen } from '../messages-screen';

/**
 * `/messages/{threadId}` — همان صندوق، با گفتگوی خواسته‌شده باز.
 *
 * ⚠️ این مسیر وجود نداشت و اعلانِ «پیامِ تازه» دقیقاً به همین آدرس لینک
 * می‌داد؛ هر کلیک روی آن ۴۰۴ ِ خامِ Next می‌گرفت — نه صفحهٔ برنامه، نه
 * منو، نه راهِ برگشت. اعلان‌های ذخیره‌شده هم همین شکل را دارند، پس مسیر
 * ساخته شد تا آن‌ها بدونِ مهاجرتِ داده درست شوند (ایمیل و تلگرام هم همین
 * نشانی را می‌فرستند).
 *
 * ⚠️ دسترسی اینجا چک نمی‌شود: باز کردنِ گفتگو از `openThreadAction` می‌گذرد
 * که خودش گاردِ عضویت در رشته را دارد (R-MSG-02). شناسهٔ نامعتبر فقط
 * صندوقِ خالی از گفتگو نشان می‌دهد، نه پیامِ کسِ دیگر.
 */
export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isInteger(threadId) || threadId <= 0) notFound();
  return MessagesScreen({ threadId });
}
