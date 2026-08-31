import { describe, expect, it } from 'vitest';
import {
  assertAcceptable, disposition, FileRejected, humanSize, kindOf, MAX_SIZE,
  normalizeExternalUrl, rejectMessage, safeDownloadName, signatureMatches,
  sniffType, storageKey, contentDisposition, planReceipts, type UploadCandidate,
} from '../upload';

/** بایت‌های اولِ یک فایلِ واقعی. */
const SIG = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d],
  zip: [0x50, 0x4b, 0x03, 0x04],
  mp4: [0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70],
  php: [0x3c, 0x3f, 0x70, 0x68, 0x70], // <?php
  svg: [0x3c, 0x73, 0x76, 0x67], // <svg
  ole: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // doc/xls ِ قدیمی
};

const bytes = (sig: number[]) => new Uint8Array(sig);

const candidate = (over: Partial<UploadCandidate> = {}): UploadCandidate => ({
  name: 'photo.jpg',
  mime: 'image/jpeg',
  size: 1000,
  head: bytes(SIG.jpeg),
  ...over,
});

describe('sniffType — امضای واقعیِ فایل', () => {
  it('نوع‌های شناخته‌شده را می‌شناسد', () => {
    expect(sniffType(bytes(SIG.jpeg))).toBe('image/jpeg');
    expect(sniffType(bytes(SIG.png))).toBe('image/png');
    expect(sniffType(bytes(SIG.gif))).toBe('image/gif');
    expect(sniffType(bytes(SIG.webp))).toBe('image/webp');
    expect(sniffType(bytes(SIG.pdf))).toBe('application/pdf');
    expect(sniffType(bytes(SIG.zip))).toBe('application/zip');
    expect(sniffType(bytes(SIG.mp4))).toBe('video/mp4');
  });

  it('چیزی که نمی‌شناسد را از خودش درنمی‌آورد', () => {
    expect(sniffType(bytes(SIG.php))).toBeNull();
    expect(sniffType(new Uint8Array([]))).toBeNull();
  });
});

describe('R-FILE-05 — پسوند و Content-Type دروغ می‌گویند', () => {
  it('⚠️ اسکریپتی که خودش را PNG معرفی کند رد می‌شود', () => {
    expect(() => assertAcceptable(
      candidate({ name: 'evil.png', mime: 'image/png', head: bytes(SIG.php) }),
      'avatar',
    )).toThrow(FileRejected);
  });

  it('⚠️ SVG اصلاً در فهرستِ سفید نیست — حتی با امضای درست', () => {
    expect(() => assertAcceptable(
      candidate({ name: 'x.svg', mime: 'image/svg+xml', head: bytes(SIG.svg) }),
      'avatar',
    )).toThrow(new FileRejected('file.type_not_allowed'));
  });

  it('تصویرِ سالم پذیرفته می‌شود', () => {
    expect(() => assertAcceptable(candidate(), 'avatar')).not.toThrow();
  });

  it('امضای تصویر باید دقیقاً همان نوعِ اعلام‌شده باشد', () => {
    // JPEG واقعی که خودش را PNG معرفی کرده — هنوز دروغ است.
    expect(signatureMatches('image/png', bytes(SIG.jpeg))).toBe(false);
    expect(signatureMatches('image/jpeg', bytes(SIG.jpeg))).toBe(true);
  });

  it('⚠️ docx باید واقعاً zip باشد — اسکریپت با نامِ docx رد می‌شود', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(signatureMatches(docx, bytes(SIG.zip))).toBe(true);
    // این حالت در نسخهٔ اولِ کد رد نمی‌شد: امضای ناشناخته پذیرفته می‌شد.
    expect(signatureMatches(docx, bytes(SIG.php))).toBe(false);
  });

  it('doc ِ قدیمی قالبِ OLE دارد، نه zip', () => {
    expect(signatureMatches('application/msword', bytes(SIG.ole))).toBe(true);
    expect(signatureMatches('application/msword', bytes(SIG.zip))).toBe(false);
  });

  it('متنِ ساده امضا ندارد ولی نباید امضای چیزِ دیگری داشته باشد', () => {
    expect(signatureMatches('text/plain', bytes([0x68, 0x69]))).toBe(true);
    expect(signatureMatches('text/plain', bytes(SIG.pdf))).toBe(false);
  });
});

describe('سقفِ حجم و ترتیبِ بررسی', () => {
  it('فایلِ خالی رد می‌شود', () => {
    expect(() => assertAcceptable(candidate({ size: 0 }), 'avatar'))
      .toThrow(new FileRejected('file.empty'));
  });

  it('آواتارِ بزرگ‌تر از ۵ مگابایت رد می‌شود', () => {
    expect(MAX_SIZE.avatar).toBe(5 * 1024 * 1024);
    expect(() => assertAcceptable(candidate({ size: MAX_SIZE.avatar + 1 }), 'avatar'))
      .toThrow(new FileRejected('file.too_large'));
  });

  it('حجم پیش از نوع بررسی می‌شود تا فایلِ بزرگ بی‌جهت خوانده نشود', () => {
    const huge = candidate({ size: MAX_SIZE.avatar + 1, mime: 'application/x-evil' });
    expect(() => assertAcceptable(huge, 'avatar')).toThrow(new FileRejected('file.too_large'));
  });

  it('نامِ خالی رد می‌شود', () => {
    expect(() => assertAcceptable(candidate({ name: '   ' }), 'avatar'))
      .toThrow(new FileRejected('file.name_missing'));
  });
});

describe('کاربردها فهرستِ سفیدِ خودشان را دارند', () => {
  it('رسید PDF می‌پذیرد ولی ویدیو نه', () => {
    expect(() => assertAcceptable(
      candidate({ name: 'r.pdf', mime: 'application/pdf', head: bytes(SIG.pdf) }), 'receipt',
    )).not.toThrow();

    expect(() => assertAcceptable(
      candidate({ name: 'v.mp4', mime: 'video/mp4', head: bytes(SIG.mp4) }), 'receipt',
    )).toThrow(new FileRejected('file.type_not_allowed'));
  });

  it('آواتار PDF نمی‌پذیرد', () => {
    expect(() => assertAcceptable(
      candidate({ name: 'r.pdf', mime: 'application/pdf', head: bytes(SIG.pdf) }), 'avatar',
    )).toThrow(new FileRejected('file.type_not_allowed'));
  });

  it('پیوستِ پروژه ویدیو می‌پذیرد', () => {
    expect(() => assertAcceptable(
      candidate({ name: 'v.mp4', mime: 'video/mp4', head: bytes(SIG.mp4) }), 'attachment',
    )).not.toThrow();
  });
});

describe('R-FILE-04 — فقط نوعِ امن inline', () => {
  it('تصویر و PDF درون‌خطی باز می‌شوند', () => {
    expect(disposition('image/png')).toBe('inline');
    expect(disposition('application/pdf')).toBe('inline');
  });

  it('⚠️ SVG و HTML همیشه دانلود می‌شوند — اسکریپت دارند', () => {
    expect(disposition('image/svg+xml')).toBe('attachment');
    expect(disposition('text/html')).toBe('attachment');
  });

  it('درخواستِ صریحِ دانلود بر inline می‌چربد', () => {
    expect(disposition('image/png', true)).toBe('attachment');
  });
});

describe('R-FILE-06 — کلیدِ ذخیره را ما می‌سازیم', () => {
  it('نامِ کاربر وارد مسیر نمی‌شود', () => {
    const key = storageKey('attachment', 'image/png', 'abc123');
    expect(key).toBe('attachment/abc123.png');
  });

  it('⚠️ توکنِ آلوده پیمایشِ مسیر نمی‌سازد', () => {
    const key = storageKey('receipt', 'image/png', '../../etc/passwd');
    // کلید باید دقیقاً یک بخش + پسوند باشد؛ هیچ اسلش یا نقطهٔ اضافه‌ای نه.
    expect(key).toMatch(/^receipt\/[a-zA-Z0-9]+\.png$/);
  });

  it('پسوند از نوعِ تأییدشده می‌آید، نه از نامِ فایل', () => {
    expect(storageKey('attachment', 'application/pdf', 'tok')).toMatch(/\.pdf$/);
    expect(storageKey('attachment', 'application/x-httpd-php', 'tok')).toMatch(/\.bin$/);
  });
});

describe('نامِ دانلود', () => {
  it('نویسه‌های شکنندهٔ هدر حذف می‌شوند', () => {
    expect(safeDownloadName('a"b\r\nc.pdf', 'application/pdf')).toBe('abc.pdf');
    expect(safeDownloadName('../../x.pdf', 'application/pdf')).toBe('.._.._x.pdf');
  });

  it('نامِ خالی جایگزینِ امن می‌گیرد', () => {
    expect(safeDownloadName('  ', 'image/png')).toBe('file.png');
  });
});

describe('R-FILE-08 — لینکِ بیرونی', () => {
  it('فقط http/https', () => {
    expect(normalizeExternalUrl('https://drive.google.com/x')).toBe('https://drive.google.com/x');
    expect(normalizeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeExternalUrl('data:text/html,<script>')).toBeNull();
    expect(normalizeExternalUrl('  ')).toBeNull();
    expect(normalizeExternalUrl('not a url')).toBeNull();
  });
});

describe('کمکی‌ها', () => {
  it('دستهٔ نمایشی', () => {
    expect(kindOf('image/png')).toBe('image');
    expect(kindOf('video/mp4')).toBe('video');
    expect(kindOf('application/pdf')).toBe('file');
  });

  it('حجمِ خوانا', () => {
    expect(humanSize(512)).toBe('512 بایت');
    expect(humanSize(2048)).toBe('2 کیلوبایت');
    expect(humanSize(3 * 1024 * 1024)).toBe('3.0 مگابایت');
  });

  it('هر دلیلِ رد پیامِ فارسی دارد', () => {
    for (const reason of [
      'file.empty', 'file.too_large', 'file.type_not_allowed',
      'file.signature_mismatch', 'file.name_missing',
    ] as const) {
      expect(rejectMessage(reason)).toBeTruthy();
      expect(rejectMessage(reason)).not.toBe(reason);
    }
  });
});

describe('هدرِ Content-Disposition', () => {
  it('⚠️ نامِ فارسی هدر را نمی‌شکند — encode می‌شود', () => {
    // هدرِ HTTP فقط ByteString می‌پذیرد؛ نامِ فارسیِ خام باعثِ ۵۰۰ می‌شد.
    const header = contentDisposition('inline', 'طرحِ اولیه.png');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toMatch(/^[\x20-\x7e]*$/); // کلِ هدر ASCII است
  });

  it('نسخهٔ سادهٔ ASCII هم برای مرورگرِ قدیمی می‌ماند', () => {
    expect(contentDisposition('attachment', 'report.pdf'))
      .toBe(`attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`);
  });

  it('نامِ کاملاً غیرِ ASCII نسخهٔ ساده‌اش خالی نمی‌شود', () => {
    const header = contentDisposition('inline', 'سند');
    expect(header).toContain('filename="___"');
  });
});

describe('ادغامِ رسیدها', () => {
  it('موجودها منهای حذف‌شده‌ها، به‌علاوهٔ تازه‌ها', () => {
    const plan = planReceipts({ existing: [1, 2, 3], removeIds: [2], addedIds: [9] });
    expect(plan.keep).toEqual([1, 3, 9]);
    expect(plan.orphaned).toEqual([2]);
  });

  it('⚠️ ذخیرهٔ بدونِ تغییر هیچ رسیدی را نمی‌اندازد', () => {
    // جایگزینیِ کاملِ ساده اینجا همه را می‌انداخت.
    const plan = planReceipts({ existing: [1, 2], removeIds: [], addedIds: [] });
    expect(plan.keep).toEqual([1, 2]);
    expect(plan.orphaned).toEqual([]);
  });

  it('⚠️ شناسهٔ بیگانه فایلِ ردیفِ دیگری را یتیم اعلام نمی‌کند', () => {
    const plan = planReceipts({ existing: [1], removeIds: [99], addedIds: [] });
    expect(plan.keep).toEqual([1]);
    expect(plan.orphaned).toEqual([]);
  });

  it('ترتیب حفظ می‌شود و تکراری یک‌بار می‌ماند', () => {
    const plan = planReceipts({ existing: [5, 6], removeIds: [], addedIds: [6, 7] });
    expect(plan.keep).toEqual([5, 6, 7]);
  });
});
