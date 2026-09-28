import { getCompany } from '@/server/people/profile-service';
import { companyLogoDataUrl } from '@/server/files/service';
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
    const [company, logo] = await Promise.all([
      getCompany(),
      companyLogoDataUrl().catch(() => null),
    ]);
    return { name: company.name?.trim() || 'KabarzaOS', logo };
  } catch {
    return { name: 'KabarzaOS', logo: null };
  }
}
