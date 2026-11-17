/**
 * قواعدِ فایل — تصمیم‌های خالص، بدونِ I/O.
 *
 * ⚠️ این ماژول امنیتی‌ترین بخشِ پورت است؛ همهٔ قواعد از
 * `docs/rules/FILES.md` می‌آیند و هر کدام تستِ خودش را دارد.
 */

import { createTranslator, type Translator } from '@/i18n/translate';

/** بدونِ مترجم همان فارسیِ مبدأ برمی‌گردد — کلید خودِ متنِ فارسی است. */
const SOURCE: Translator = createTranslator({});

export class FileRejected extends Error {
  constructor(public readonly reason: RejectReason) {
    super(reason);
    this.name = 'FileRejected';
  }
}

export type RejectReason =
  | 'file.empty'
  | 'file.too_large'
  | 'file.type_not_allowed'
  | 'file.signature_mismatch'
  | 'file.name_missing'
  | 'file.too_many';

export const REJECT_MESSAGES: Record<RejectReason, string> = {
  'file.empty': 'فایلی انتخاب نشده است.',
  'file.too_large': 'حجمِ فایل بیش از حدِ مجاز است.',
  'file.type_not_allowed': 'این نوعِ فایل پذیرفته نمی‌شود.',
  'file.signature_mismatch': 'محتوای فایل با نوعِ اعلام‌شده‌اش نمی‌خواند.',
  'file.name_missing': 'نامِ فایل خوانده نشد.',
  'file.too_many': 'در هر بار حداکثر ۱۰ فایل.',
};

export function rejectMessage(reason: RejectReason): string {
  return REJECT_MESSAGES[reason];
}

/* ------------------------------------------------------------------ *
 * سقفِ حجم
 * ------------------------------------------------------------------ */

const MB = 1024 * 1024;

/** سقف‌ها به بایت — آواتارِ ۵ مگابایت از خودِ نسخهٔ قبلی می‌آید (R-FILE-05). */
export const MAX_SIZE = {
  avatar: 5 * MB,
  receipt: 10 * MB,
  attachment: 50 * MB,
} as const;

export type Purpose = keyof typeof MAX_SIZE;

/**
 * سقفِ شمارِ رسانه در یک ارسال (تسک، یادداشت، کامنت). ده عکس با سقفِ ۵۰ مگ
 * می‌تواند از سقفِ بدنهٔ درخواست (۶۰ مگ) بگذرد؛ آن را سرور با پیامِ خودش رد
 * می‌کند و انتخابگر هم پیش از ارسال جمعِ حجم را می‌سنجد.
 */
export const MAX_MEDIA = 10;

/** سقفِ جمعِ حجمِ یک ارسال — کمی زیرِ `bodySizeLimit` ِ next.config. */
export const MAX_MEDIA_TOTAL = 55 * MB;

/* ------------------------------------------------------------------ *
 * فهرستِ سفیدِ نوع
 * ------------------------------------------------------------------ */

/**
 * ⚠️ R-FILE-05 — تصویر فقط رَستری. **SVG عمداً نیست**: می‌تواند اسکریپت داشته
 * باشد و روی دامنهٔ ما اجرا شود.
 */
export const IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
] as const;

const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/zip',
] as const;

const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

/**
 * ۳.۱۰.۰ — فایل‌های کاریِ رایج که پیش از این رد می‌شدند (فقط پیوستِ پروژه/تسک/کامنت، نه آواتار
 * و رسید). هر کدام باز هم با **محتوای واقعی** سنجیده می‌شود (`signatureMatches`).
 * ⚠️ SVG فقط دانلودی است (در INLINE_SAFE نیست) و پاسخش `CSP: sandbox` دارد: اسکریپتِ داخلش
 * روی دامنهٔ ما اجرا نمی‌شود؛ در `<img>` هم اسکریپت اجرا نمی‌شود.
 */
export const SVG = 'image/svg+xml';
export const PSD = 'image/vnd.adobe.photoshop';
const WORK_TYPES = [
  SVG, PSD,
  'application/vnd.rar', 'application/x-7z-compressed',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/json', 'text/markdown',
] as const;

/** نوع‌های مجاز برای هر کاربرد. */
export const ALLOWED_TYPES: Record<Purpose, readonly string[]> = {
  avatar: IMAGE_TYPES,
  receipt: [...IMAGE_TYPES, 'application/pdf'],
  attachment: [...IMAGE_TYPES, ...DOCUMENT_TYPES, ...VIDEO_TYPES, ...WORK_TYPES],
};

/**
 * ⚠️ R-FILE-04 — فقط این‌ها inline باز می‌شوند. هر چیزِ دیگر — به‌ویژه
 * `image/svg+xml` و `text/html` — به دانلود مجبور می‌شود، وگرنه اسکریپتِ داخلش
 * در نشستِ بیننده روی دامنهٔ ما اجرا می‌شود. `nosniff` جلوی این را نمی‌گیرد.
 */
const INLINE_SAFE = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'image/bmp', 'image/x-icon', 'image/avif', 'application/pdf',
]);

export function disposition(mime: string, forceDownload = false): 'inline' | 'attachment' {
  if (forceDownload) return 'attachment';
  return INLINE_SAFE.has(mime.toLowerCase()) ? 'inline' : 'attachment';
}

/** دستهٔ نمایشیِ فایل — همان `kind_for()` نسخهٔ قبلی. */
export function kindOf(mime: string): 'image' | 'video' | 'file' {
  // ⚠️ فقط تصویری که مرورگر می‌کشد «تصویر» است — PSD در `<img>` شکسته دیده می‌شد.
  if (mime.startsWith('image/') && mime !== PSD) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

/* ------------------------------------------------------------------ *
 * امضای فایل — تنها چیزِ قابلِ اعتماد
 * ------------------------------------------------------------------ */

/** امضای قالبِ قدیمیِ آفیس (doc/xls) — نوعِ MIME ِ استانداردی ندارد. */
export const OLE = 'application/x-ole-storage';

/**
 * نوعِ واقعیِ فایل از روی بایت‌های اولش.
 *
 * ⚠️ R-FILE-05 — پسوند و `Content-Type` هر دو از سمتِ کاربر می‌آیند و دروغ
 * می‌گویند. یک `.php` که خودش را `image/png` معرفی کند اینجا لو می‌رود.
 */
export function sniffType(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i];
  const has = (offset: number, ...sig: number[]) =>
    sig.every((b, i) => at(offset + i) === b);

  if (has(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (has(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (has(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif'; // GIF8
  // RIFF....WEBP
  if (has(0, 0x52, 0x49, 0x46, 0x46) && has(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (has(0, 0x25, 0x50, 0x44, 0x46)) return 'application/pdf'; // %PDF
  if (has(0, 0x50, 0x4b, 0x03, 0x04)) return 'application/zip'; // zip (نیز docx/xlsx)
  // OLE Compound File — قالبِ قدیمیِ doc/xls.
  if (has(0, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return OLE;
  // ....ftypavif — AVIF هم ftyp دارد؛ پیش از MP4، وگرنه «ویدیو» خوانده می‌شد و خطا گمراه‌کننده بود.
  if (has(4, 0x66, 0x74, 0x79, 0x70) && (has(8, 0x61, 0x76, 0x69, 0x66) || has(8, 0x61, 0x76, 0x69, 0x73))) return 'image/avif';
  // ....ftyp — خانوادهٔ MP4/QuickTime
  if (has(4, 0x66, 0x74, 0x79, 0x70)) return 'video/mp4';
  if (has(0, 0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
  if (has(0, 0x52, 0x61, 0x72, 0x21, 0x1a, 0x07)) return 'application/vnd.rar'; // Rar!
  if (has(0, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return 'application/x-7z-compressed';
  if (has(0, 0x38, 0x42, 0x50, 0x53)) return PSD; // 8BPS
  return null;
}

/**
 * آیا امضای واقعی با نوعِ اعلام‌شده سازگار است؟
 *
 * ⚠️ هر قالبِ **دودویی** باید امضای قطعی داشته باشد. یک نسخهٔ نرم‌تر که
 * «امضای ناشناخته» را هم می‌پذیرفت، اسکریپتِ `<?php` با نامِ `.docx` را رد
 * نمی‌کرد — تست همان را گرفت. تنها استثنا متنِ ساده/CSV است که ذاتاً امضا
 * ندارد؛ آنجا هم دستِ‌کم نباید امضای چیزِ دیگری داشته باشد.
 */
export function signatureMatches(declared: string, bytes: Uint8Array): boolean {
  const actual = sniffType(bytes);
  const mime = declared.toLowerCase();

  // ادعای تصویر یا PDF ← باید دقیقاً همان باشد.
  // SVG متن است (امضای دودویی ندارد): نباید امضای چیزِ دیگری داشته باشد و باید با «<» شروع شود.
  if (mime === SVG) return actual === null && startsLikeMarkup(bytes);
  if (mime.startsWith('image/') || mime === 'application/pdf') return actual === mime;
  if (mime === 'application/vnd.rar' || mime === 'application/x-7z-compressed') return actual === mime;

  // ادعای ویدیو ← باید یکی از امضاهای ویدیویی باشد.
  if (mime.startsWith('video/')) return actual === 'video/mp4' || actual === 'video/webm';

  // docx/xlsx در واقع zip هستند.
  if (mime === 'application/zip' || mime.includes('officedocument')) {
    return actual === 'application/zip';
  }

  // doc/xls ِ قدیمی قالبِ OLE دارند، نه zip.
  if (mime === 'application/msword' || mime === 'application/vnd.ms-excel' || mime === 'application/vnd.ms-powerpoint') {
    return actual === OLE;
  }

  // متنِ ساده/CSV امضا ندارد؛ ولی نباید امضای چیزِ دیگری داشته باشد.
  if (mime.startsWith('text/') || mime === 'application/json') return actual === null;

  return false;
}

/** پس از BOM و فاصله، با «<» شروع می‌شود؟ (`<svg` یا `<?xml`) */
function startsLikeMarkup(bytes: Uint8Array): boolean {
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  return bytes[i] === 0x3c;
}

/**
 * نام‌های گوناگونی که مرورگرها/سیستم‌عامل‌ها برای یک نوع می‌گذارند ← نامِ واحدِ فهرستِ سفید.
 * ⚠️ کروم روی ویندوز zip را `application/x-zip-compressed` معرفی می‌کند؛ پیش از ۳.۱۰.۰ همین
 * باعث می‌شد zip ِ کاملاً سالم «نوعِ مجاز نیست» بگیرد.
 */
const MIME_ALIASES: Record<string, string> = {
  'application/x-zip-compressed': 'application/zip', 'application/x-zip': 'application/zip',
  'multipart/x-zip': 'application/zip',
  'application/x-rar-compressed': 'application/vnd.rar', 'application/x-rar': 'application/vnd.rar',
  'image/svg': SVG,
  'image/photoshop': PSD, 'image/x-photoshop': PSD, 'application/photoshop': PSD,
  'application/x-photoshop': PSD, 'application/psd': PSD,
  'text/x-markdown': 'text/markdown',
  'text/json': 'application/json',
};

/** وقتی مرورگر نوعی نگفته (`""` یا octet-stream): از پسوند — فقط برای قالب‌های متنی که امضا ندارند. */
const TEXT_BY_EXTENSION: Record<string, string> = {
  svg: SVG, md: 'text/markdown', markdown: 'text/markdown', json: 'application/json',
  txt: 'text/plain', csv: 'text/csv',
};

/* ------------------------------------------------------------------ *
 * اعتبارسنجیِ کامل
 * ------------------------------------------------------------------ */

export interface UploadCandidate {
  name: string;
  mime: string;
  size: number;
  /** بایت‌های اولِ فایل — برای بررسیِ امضا. ۳۲ بایت کافی است. */
  head: Uint8Array;
}

/**
 * نوعِ قابلِ اعتمادِ یک تصویر (۳.۸.۰).
 *
 * ⚠️ عکسی که از وب ذخیره می‌شود اغلب پسوندِ دروغ دارد: JPEG با نامِ «‎.webp» (سایت
 * بسته به مرورگر قالب را عوض می‌کند). مرورگر نوع را از پسوند می‌گوید، پس پیش از این
 * «محتوا با نوع نمی‌خواند» رد می‌شد. اگر ادعا تصویر است و **بایت‌های واقعی** هم
 * تصویری از نوع‌های مجازِ همین کاربرد، نوعِ واقعی به کار می‌رود — امن است، چون
 * تصمیم با امضاست نه با ادعا. هر چیزِ دیگر (اسکریپت با نامِ تصویر، PDF با نامِ PNG)
 * مثلِ قبل رد می‌شود.
 */
export function trustedMime(declared: string, head: Uint8Array, purpose: Purpose, name = ''): string {
  const raw = declared.toLowerCase().split(';')[0]!.trim();
  let mime = MIME_ALIASES[raw] ?? raw;
  const actual = sniffType(head);
  // نوعِ نامعلوم: قالبِ دودویی از امضا، قالبِ متنی از پسوند (بعد همان سنجشِ امضا روی آن).
  if (mime === '' || mime === 'application/octet-stream') {
    const ext = name.toLowerCase().split('.').pop() ?? '';
    mime = actual && actual !== OLE ? actual : TEXT_BY_EXTENSION[ext] ?? mime;
  }
  if (!mime.startsWith('image/') || mime === SVG) return mime;
  if (actual && actual !== mime && actual.startsWith('image/') && ALLOWED_TYPES[purpose].includes(actual)) return actual;
  // تصویرِ واقعی ولی از نوعی که مجاز نیست (مثلاً AVIF) ← «نوع مجاز نیست»، نه «نمی‌خواند».
  if (actual && actual.startsWith('image/') && !ALLOWED_TYPES[purpose].includes(actual)) return actual;
  return mime;
}

/**
 * تصمیمِ پذیرش. ترتیب مهم است: ارزان‌ترین بررسی اول، تا فایلِ بزرگِ نامعتبر
 * هرگز خوانده نشود. نوعِ تأییدشده را برمی‌گرداند (← `trustedMime`)؛ ذخیره با همین است.
 */
export function assertAcceptable(file: UploadCandidate, purpose: Purpose): string {
  if (!file.name.trim()) throw new FileRejected('file.name_missing');
  if (file.size <= 0) throw new FileRejected('file.empty');
  if (file.size > MAX_SIZE[purpose]) throw new FileRejected('file.too_large');

  const mime = trustedMime(file.mime, file.head, purpose, file.name);
  if (!ALLOWED_TYPES[purpose].includes(mime)) throw new FileRejected('file.type_not_allowed');

  if (!signatureMatches(mime, file.head)) throw new FileRejected('file.signature_mismatch');
  return mime;
}

/* ------------------------------------------------------------------ *
 * کلیدِ ذخیره
 * ------------------------------------------------------------------ */

/** پسوندِ امنِ هر نوع — از نوعِ **تأییدشده** می‌آید، نه از نامِ کاربر. */
const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'application/pdf': 'pdf', 'application/zip': 'zip', 'text/plain': 'txt', 'text/csv': 'csv',
  'application/msword': 'doc', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  [SVG]: 'svg', [PSD]: 'psd', 'application/vnd.rar': 'rar', 'application/x-7z-compressed': '7z',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/json': 'json', 'text/markdown': 'md',
};

/**
 * کلیدِ شیء در S3.
 *
 * ⚠️ R-FILE-06 — نامِ کاربر **هرگز** وارد مسیر نمی‌شود. کلید را کاملاً خودمان
 * می‌سازیم تا نه پیمایشِ مسیر ممکن باشد، نه پسوندِ اجراشدنی.
 * نامِ اصلی جدا در دیتابیس نگه داشته می‌شود تا دانلود نامِ درست بگیرد.
 */
export function storageKey(purpose: Purpose, mime: string, token: string): string {
  const ext = EXTENSION[mime.toLowerCase()] ?? 'bin';
  const safeToken = token.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  return `${purpose}/${safeToken}.${ext}`;
}

/** نامِ فایل برای هدرِ دانلود — بدونِ نویسه‌هایی که هدر را می‌شکنند. */
export function safeDownloadName(originalName: string, mime: string): string {
  const cleaned = originalName.replace(/[\r\n"\\]/g, '').replace(/[/\\]/g, '_').trim();
  if (!cleaned) return `file.${EXTENSION[mime.toLowerCase()] ?? 'bin'}`;
  return fixImageExtension(cleaned, mime).slice(0, 120);
}

/**
 * ۳.۹.۰ — تصویری که با پسوندِ نادرست آمده و با نوعِ واقعی‌اش ذخیره شده (`trustedMime`: JPEG با نامِ
 * «‎.webp») با پسوندِ درست دانلود شود؛ وگرنه برنامه‌ای که با پسوند تصمیم می‌گیرد بازش نمی‌کرد.
 * فقط پسوندِ **تصویری** ِ نادرست عوض می‌شود — نامِ بی‌پسوند یا پسوندِ غیرِ تصویری دست نمی‌خورد.
 */
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp']);
function fixImageExtension(name: string, mime: string): string {
  const want = EXTENSION[mime.toLowerCase()];
  if (!want || !mime.toLowerCase().startsWith('image/')) return name;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name;
  const ext = name.slice(dot + 1).toLowerCase();
  if (!IMAGE_EXTS.has(ext) || ext === want || (ext === 'jpeg' && want === 'jpg')) return name;
  return `${name.slice(0, dot)}.${want}`;
}

/**
 * مقدارِ کاملِ هدرِ `Content-Disposition`.
 *
 * ⚠️ هدرهای HTTP فقط **ByteString** می‌پذیرند؛ نامِ فارسی مستقیم در
 * `filename=` باعثِ ۵۰۰ می‌شود — و در این اپ بیشترِ نام‌ها فارسی‌اند. پس طبقِ
 * RFC 6266 دو شکل می‌فرستیم: یک `filename` ِ ASCII برای مرورگرِ قدیمی، و
 * `filename*` ِ UTF-8 که مرورگرهای امروزی ترجیح می‌دهند و نامِ درست را نشان
 * می‌دهند.
 */
export function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  // هر چیزِ غیرِ ASCII و نویسه‌های کنترلی از نسخهٔ ساده حذف می‌شوند.
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '') || 'file';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/* ------------------------------------------------------------------ *
 * لینکِ بیرونی
 * ------------------------------------------------------------------ */

/**
 * ⚠️ R-FILE-08 — فقط http/https. `javascript:` و `data:` باید بمیرند.
 * هیچ‌وقت سمتِ سرور درخواست نمی‌شود، پس SSRF ندارد.
 */
export function normalizeExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.toString();
}

/** حجمِ خوانا. */
export function humanSize(bytes: number, t: Translator = SOURCE): string {
  if (bytes < 1024) return t('{n} بایت', { n: bytes });
  if (bytes < MB) return t('{n} کیلوبایت', { n: (bytes / 1024).toFixed(0) });
  // گیگ از ۲.۶۰.۰ — سهمیهٔ صندوقِ ایمیل «۵۱۲۰.۰ مگابایت» دیده می‌شد. ⚠️ رقمِ صفرِ پایانی می‌افتد (۵ گیگابایت).
  if (bytes >= 1024 * MB) return t('{n} گیگابایت', { n: String(Number((bytes / (1024 * MB)).toFixed(1))) });
  return t('{n} مگابایت', { n: (bytes / MB).toFixed(1) });
}

/* ------------------------------------------------------------------ *
 * رسیدهای ردیفِ دفتر
 * ------------------------------------------------------------------ */

export interface ReceiptPlan {
  /** فهرستِ نهایی که روی ردیف می‌نشیند. */
  keep: number[];
  /** فایل‌هایی که دیگر به هیچ ردیفی وصل نیستند و باید پاک شوند (R-FILE-10). */
  orphaned: number[];
}

/**
 * ادغامِ رسیدها هنگامِ ویرایش — پورتِ منطقِ.
 *
 * ⚠️ قاعده: «موجودها منهای آن‌هایی که تیکِ حذف خورده‌اند، **به‌علاوهٔ**
 * تازه‌ها». ساده‌ترین پیاده‌سازیِ ممکن (جایگزینیِ کامل با فهرستِ فرم) رسیدهای
 * قبلی را بی‌صدا می‌انداخت — سندِ مالی‌ای که کسی عمداً حذفش نکرده بود.
 *
 * ترتیب هم حفظ می‌شود: قدیمی‌ها اول، تازه‌ها آخر.
 */
export function planReceipts(input: {
  existing: readonly number[];
  removeIds: readonly number[];
  addedIds: readonly number[];
}): ReceiptPlan {
  const remove = new Set(input.removeIds);
  // فقط چیزی حذف می‌شود که واقعاً روی همین ردیف بوده — شناسهٔ دلخواهِ فرم
  // نباید فایلِ ردیفِ دیگری را پاک کند.
  const orphaned = input.existing.filter((id) => remove.has(id));
  const kept = input.existing.filter((id) => !remove.has(id));

  // تکراری‌ها یک‌بار می‌مانند؛ دوبار پیوست‌کردنِ یک فایل معنا ندارد.
  const keep = [...new Set([...kept, ...input.addedIds])];
  return { keep, orphaned };
}
