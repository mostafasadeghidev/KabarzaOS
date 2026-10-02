import { MessagesScreen } from './messages-screen';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('پیام‌ها');

export default async function MessagesPage() {
  return MessagesScreen({});
}
