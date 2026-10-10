import { z } from 'zod';
import { normalizeSiteUrl } from '@/domain/projects/site-links';

/**
 * اسکیمای ساختِ پروژه — فیلدها از فرمِ نسخهٔ قبلی.
 *
 * ⚠️ در فایلِ جدا از اکشن، چون فایلِ `'use server'` فقط تابعِ async
 * می‌تواند صادر کند. همین اسکیما بعداً برای مسیرِ API هم استفاده می‌شود.
 */

/** مبلغ: رشتهٔ decimal با حداکثر ۴ رقمِ اعشار (G2 — هرگز float). */
const money = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+(\.\d{1,4})?$/.test(v), 'مبلغ معتبر نیست')
  .transform((v) => (v === '' ? '0' : v));

/** تاریخِ روز یا خالی. */
const day = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'تاریخ معتبر نیست')
  .transform((v) => (v === '' ? null : v));

/**
 * آدرسِ سایت: خالی مجاز است؛ پر باید http(s) و با میزبانِ کامل باشد.
 * بی‌طرحِ آدرس (example.com) خودکار https می‌گیرد.
 */
const siteUrl = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    if (v !== '' && normalizeSiteUrl(v) === null) {
      ctx.addIssue({ code: 'custom', message: 'آدرسِ سایت معتبر نیست' });
    }
  })
  .transform((v) => (v === '' ? '' : normalizeSiteUrl(v) ?? ''));

/** شناسه از فرم می‌آید به‌صورت رشته؛ «۰» یعنی انتخاب‌نشده. */
const optionalId = z
  .string()
  .trim()
  .transform((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  });

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, 'عنوانِ پروژه الزامی است').max(200, 'عنوان بیش از حد بلند است'),
  description: z.string().trim().max(5000).default(''),
  regDate: day,
  deadline: day,
  statusTagId: optionalId,
  price: money,
  currencyId: optionalId,
  officeId: optionalId,
  parentId: optionalId,
  /** لینک‌های سایتِ پروژه (۲.۱۹.۰) — هر دو اختیاری. */
  liveUrl: siteUrl,
  testUrl: siteUrl,
  urlsClientVisible: z.boolean().default(false),
  isUnitBased: z.boolean().default(false),
  isTender: z.boolean().default(false),
  /**
   * ردیف‌های جدولِ نقش/سقفِ مناقصه.
   * ⚠️ باید در اسکیمای zod باشد وگرنه بی‌صدا حذف می‌شود — همین یک‌بار اتفاق
   * افتاد و مناقصه بدونِ نقش ذخیره شد.
   */
  tenderRoles: z.array(z.object({
    roleTagId: z.number(),
    cap: z.string(),
  })).default([]),
  scope: z.enum(['company', 'private']).default('company'),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export interface FormState {
  /** شناسهٔ پروژه در حالتِ ویرایش. */
  savedId?: number;
  /** پیامِ موفقیت — توست از همین می‌خواند. */
  message?: string;
  error?: string;
  /** خطای فیلدها برای نمایشِ کنارِ همان ورودی. */
  fieldErrors?: Partial<Record<keyof CreateProjectInput, string>>;
  /**
   * مقادیرِ خامی که کاربر فرستاده بود.
   *
   * ⚠️ React پس از هر action فرم را ریست می‌کند؛ بدونِ این، یک خطای کوچک
   * تمامِ چیزی را که کاربر تایپ کرده بود پاک می‌کرد. اینها به `defaultValue`
   * برمی‌گردند تا فرم دست‌نخورده بماند.
   */
  values?: Record<string, string>;
}
