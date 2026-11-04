import type { MetadataRoute } from 'next';
import { brandIdentity } from '@/server/setup/public-brand';
import { ICON_BACKGROUND } from '@/domain/brand/icon';
import { currentLocale } from '@/i18n/server';
import { direction } from '@/i18n/config';

/**
 * مانیفستِ PWA (۲.۵۴.۰) — برنامه از مرورگر «نصب» می‌شود: آیکون روی گوشی و
 * دسکتاپ، پنجرهٔ جدا بی‌نوارِ آدرس، شروع از داشبورد.
 *
 * ⚠️ پویا، نه ساخته‌شده در build: نام و لوگو از «مشخصاتِ شرکت» می‌آیند و در
 * build دیتابیسی نیست. نسخه در نشانیِ آیکون تا لوگوی تازه جای کش را بگیرد.
 */
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [brand, locale] = await Promise.all([brandIdentity(), currentLocale()]);
  const icon = (size: number) => `/brand-icon?size=${size}&v=${brand.version}`;
  return {
    id: '/',
    name: brand.name,
    short_name: brand.name.slice(0, 24),
    lang: locale,
    dir: direction(locale),
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: ICON_BACKGROUND,
    icons: [
      { src: icon(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon(512), sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
