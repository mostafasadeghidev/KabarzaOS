import { z } from 'zod';

/**
 * ردیف‌های اعضا از فرم می‌آیند: آرایه‌های موازی، دقیقاً مثلِ نسخهٔ قبلی
 * (, …).
 */

const amount = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+(\.\d{1,4})?$/.test(v), 'مبلغ معتبر نیست')
  .transform((v) => (v === '' ? '0' : v));

const id = z
  .string()
  .trim()
  .transform((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  });

export const memberRowSchema = z.object({
  userId: id,
  roleTagId: id,
  agreedAmount: amount,
  unitRate: amount,
  currencyId: id,
});

export type MemberRowInput = z.infer<typeof memberRowSchema>;

export interface MembersFormState {
  error?: string;
  /** خطا به‌ازای شمارهٔ ردیف، تا کاربر بداند کدام سطر مشکل دارد. */
  rowErrors?: Record<number, string>;
  ok?: boolean;
  /** خلاصهٔ آنچه واقعاً اتفاق افتاد — از diff ِ سرویس. */
  summary?: { added: number; updated: number; removed: number };
  /**
   * کسانی که برداشته شدند ولی به‌خاطرِ طلبِ تسویه‌نشده ماندند (R-PROJ-23).
   * ⚠️ بدونِ این، حذف بی‌صدا شکست می‌خورد: کاربر «ذخیره شد» می‌دید و عضو
   * سرِ جایش بود.
   */
  keptOwed?: string[];
  /** همان، ولی به‌خاطرِ عضوِ سابق بودن (R-PROJ-08 §۲). */
  keptFormer?: string[];
}
