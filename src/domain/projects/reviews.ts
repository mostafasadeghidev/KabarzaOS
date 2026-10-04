/**
 * بازبینیِ پروژه — تصمیم‌های خالص، بدونِ I/O (۱.۱۱۶.۰).
 *
 * بازبینی نتیجهٔ بررسیِ پروژه است: معمولاً یک ویدئوی لوم که مدیر ضبط کرده و
 * فهرستی از اصلاحات که هر کدام یک تسک می‌شود. اغلب فقط برای یک یا چند نقش
 * است، و بیشترِ وقت‌ها کارفرما نباید ببیندش.
 */

import { parseVideoUrl } from '@/domain/files/video';
import type { ReviewSource } from '@/db/schema/projects';

/** رابطهٔ بیننده با پروژه — همان `projectRelation` + مدیریت. */
export interface ReviewViewer {
  userId: number;
  /** مدیرِ همین پروژه (سراسری، دفتر، مدیرِ پروژه). */
  manages: boolean;
  isMember: boolean;
  isClient: boolean;
  /** نقش‌های بیننده روی همین پروژه. */
  roleTagIds: readonly number[];
}

export interface ReviewAudience {
  createdBy: number;
  /** نقش‌های مخاطب؛ تهی = کلِ تیمِ پروژه. */
  roleTagIds: readonly number[];
  clientVisible: boolean;
}

/**
 * چه کسی بازبینی را می‌بیند:
 *  ۱. مدیرِ پروژه و سازندهٔ بازبینی — همیشه.
 *  ۲. عضو — اگر بازبینی برای کلِ تیم است، یا یکی از نقش‌هایش در مخاطب است.
 *  ۳. کارفرما — فقط اگر «برای کارفرما نمایش داده شود» روشن است.
 *
 * ⚠️ کسی که هم عضو است هم کارفرما، از هر دو در می‌تواند وارد شود: نقشِ
 * عضوی‌اش او را از دیدنِ بازبینیِ تیمش محروم نمی‌کند.
 */
export function canSeeReview(viewer: ReviewViewer, review: ReviewAudience): boolean {
  if (viewer.manages || review.createdBy === viewer.userId) return true;
  if (viewer.isMember) {
    if (review.roleTagIds.length === 0) return true;
    const mine = new Set(viewer.roleTagIds);
    if (review.roleTagIds.some((r) => mine.has(r))) return true;
  }
  return viewer.isClient && review.clientVisible;
}

/**
 * آیا این بیننده تسکِ «پنهان از کارفرما» را می‌بیند؟
 * ⚠️ فقط کسی که **تنها** کارفرمای این پروژه است محروم می‌شود؛ عضو و مدیر و
 * کادرِ بی‌رابطه (بینندهٔ مجوزی) می‌بینند.
 */
export function seesClientHidden(viewer: Pick<ReviewViewer, 'manages' | 'isMember' | 'isClient'>): boolean {
  return viewer.manages || viewer.isMember || !viewer.isClient;
}

/** فیلترِ فهرست با همان قاعده. */
export function withoutClientHidden<T extends { clientHidden: boolean }>(
  records: readonly T[],
  viewer: Pick<ReviewViewer, 'manages' | 'isMember' | 'isClient'>,
): T[] {
  return seesClientHidden(viewer) ? [...records] : records.filter((r) => !r.clientHidden);
}

/**
 * منبعِ بازبینی از روی پیوند — کاربر لازم نیست خودش «لوم» را انتخاب کند.
 * انتخابِ صریحِ کاربر (واتس‌اپ، جلسه…) بر حدس مقدم است.
 */
export function detectSource(chosen: ReviewSource | null, videoUrl: string | null, hasUploadedVideo: boolean): ReviewSource {
  const video = videoUrl ? parseVideoUrl(videoUrl) : null;
  if (chosen && chosen !== 'video') return chosen;
  if (video) return video.provider;
  if (hasUploadedVideo) return 'upload';
  return chosen ?? 'other';
}

export const SOURCE_LABELS: Record<ReviewSource, string> = {
  video: 'ویدئو',
  loom: 'Loom',
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  upload: 'ویدئوی بارگذاری‌شده',
  whatsapp: 'واتس‌اپ',
  document: 'سند',
  meeting: 'جلسه',
  other: 'دیگر',
};

/** منابعی که کاربر می‌تواند صریح انتخاب کند (بقیه از پیوند حدس زده می‌شوند). */
export const PICKABLE_SOURCES: readonly ReviewSource[] = ['video', 'whatsapp', 'document', 'meeting', 'other'];

export interface ReviewItemTiming {
  start: number | null;
  end: number | null;
}

/**
 * بازهٔ زمانیِ مورد: پایانِ بی‌آغاز معنا ندارد و پایان پیش از آغاز جابه‌جا
 * می‌شود (کاربر اشتباهی برعکس زده) — نه خطا، چون نیتش روشن است.
 */
export function normalizeTiming(start: number | null, end: number | null): ReviewItemTiming {
  if (start === null) return { start: end, end: null };
  if (end === null || end === start) return { start, end: null };
  return end < start ? { start: end, end: start } : { start, end };
}

/** پیشرفتِ بازبینی: «حل‌شده» = گروهِ تکمیل (انجام شد، انجام نمی‌شود، بایگانی). */
export function reviewProgress(items: ReadonlyArray<{ done: boolean }>): { done: number; total: number; percent: number } {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
