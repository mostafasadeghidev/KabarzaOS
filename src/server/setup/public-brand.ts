import { getCompany } from '@/server/people/profile-service';
import { getSystemConfig } from '@/server/settings/system-service';
import { companyLogoDataUrl } from '@/server/files/service';
import { stableHash } from '@/domain/files/monogram';
import type { PublicBrand } from '@/components/public-shell';

/**
 * نام و لوگوی شرکت برای صفحه‌های بیرونِ ورود.
 *
 * ⚠️ بازیگر نمی‌خواهد و گاردی ندارد — همان اطلاعاتِ عمومی‌ای که روی سربرگِ
 * فاکتور می‌آید. هر خطایی (نصبِ نیمه‌کاره، انبارِ فایلِ خاموش) به برندِ
 * پیش‌فرض می‌افتد تا صفحهٔ ورود هرگز به‌خاطرِ یک لوگو نشکند.
 */
export async function publicBrand(): Promise<PublicBrand> {
  try {
    const [company, logo, system] = await Promise.all([
      getCompany(),
      companyLogoDataUrl().catch(() => null),
      getSystemConfig().catch(() => null),
    ]);
    return { name: company.name?.trim() || system?.brandName || 'KabarzaOS', logo };
  } catch {
    return { name: 'KabarzaOS', logo: null };
  }
}

/**
 * نامِ برند و «نسخهٔ» آیکون — سبک (بی‌خواندنِ فایل)، برای عنوانِ تب و پیوندِ
 * فاوآیکون در هر صفحه. نسخه با لوگو و نام عوض می‌شود، پس مرورگر آیکونِ کهنه
 * را از کش نشان نمی‌دهد. همان ترتیبِ نامِ `publicBrand`؛ هر خطایی برندِ پیش‌فرض است.
 */
export async function brandIdentity(): Promise<{ name: string; version: string }> {
  try {
    const [company, system] = await Promise.all([getCompany(), getSystemConfig().catch(() => null)]);
    const name = company.name?.trim() || system?.brandName?.trim() || 'KabarzaOS';
    return { name, version: `${company.logoFileId ?? 0}-${stableHash(name).toString(36)}` };
  } catch {
    return { name: 'KabarzaOS', version: '0' };
  }
}
