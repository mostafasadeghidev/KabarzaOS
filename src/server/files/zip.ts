import { crc32 } from 'node:zlib';

/**
 * سازندهٔ ZIP ِ جریانی (۳.۹.۰) — برای «دانلودِ همهٔ فایل‌های پروژه».
 *
 * ⚠️ چرا خودمان: یک قالبِ ساده و پایدار است و وابستگیِ تازه نمی‌خواهد. روشِ «store»
 * (بی فشرده‌سازی): بیشترِ فایل‌های پروژه (عکس، ویدئو، PDF، zip) خودشان فشرده‌اند و
 * فشردنِ دوباره فقط CPU ِ سرور را می‌خورد.
 * ⚠️ جریانی: هر فایل همان لحظه از مخزن (سرور یا فضای ابری) خوانده و فرستاده می‌شود؛ هیچ
 * فایلی کامل در حافظه نمی‌ماند. چون CRC و اندازه پیش از خواندن معلوم نیست، پس از هر
 * فایل «data descriptor» می‌آید (بیتِ ۳). نام‌ها UTF-8 (بیتِ ۱۱) — نامِ فارسی درست باز شود.
 * ⚠️ بی ZIP64: هر فایل و کلِ بایگانی باید زیرِ ۴ گیگابایت بماند (`ZIP_MAX_TOTAL`).
 */
export const ZIP_MAX_TOTAL = 3.5 * 1024 ** 3;

export interface ZipEntry {
  /** مسیر داخلِ بایگانی (یکتا؛ `uniqueZipNames`). */
  name: string;
  date: Date;
  open: () => Promise<ReadableStream<Uint8Array>>;
}

const FLAGS = 0x0008 | 0x0800; // data descriptor + UTF-8

function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function localHeader(name: Buffer, t: { time: number; date: number }): Buffer {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4); // نسخهٔ لازم
  h.writeUInt16LE(FLAGS, 6);
  h.writeUInt16LE(0, 8); // store
  h.writeUInt16LE(t.time, 10);
  h.writeUInt16LE(t.date, 12);
  // crc و اندازه‌ها صفر — در data descriptor می‌آیند.
  h.writeUInt16LE(name.length, 26);
  return Buffer.concat([h, name]);
}

function descriptor(crc: number, size: number): Buffer {
  const d = Buffer.alloc(16);
  d.writeUInt32LE(0x08074b50, 0);
  d.writeUInt32LE(crc >>> 0, 4);
  d.writeUInt32LE(size, 8);
  d.writeUInt32LE(size, 12);
  return d;
}

interface Written { name: Buffer; crc: number; size: number; offset: number; t: { time: number; date: number } }

function centralEntry(w: Written): Buffer {
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4); // ساخته‌شده با
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(FLAGS, 8);
  c.writeUInt16LE(0, 10);
  c.writeUInt16LE(w.t.time, 12);
  c.writeUInt16LE(w.t.date, 14);
  c.writeUInt32LE(w.crc >>> 0, 16);
  c.writeUInt32LE(w.size, 20);
  c.writeUInt32LE(w.size, 24);
  c.writeUInt16LE(w.name.length, 28);
  c.writeUInt32LE(w.offset, 42);
  return Buffer.concat([c, w.name]);
}

function endRecord(count: number, cdSize: number, cdOffset: number): Buffer {
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(count, 8);
  e.writeUInt16LE(count, 10);
  e.writeUInt32LE(cdSize, 12);
  e.writeUInt32LE(cdOffset, 16);
  return e;
}

/** بایگانی را جریانی می‌سازد. خطای خواندنِ یک فایل کلِ جریان را می‌بندد (دانلودِ ناقص، نه zip ِ خراب ِ بی‌صدا). */
export function zipStream(entries: readonly ZipEntry[]): ReadableStream<Uint8Array> {
  let offset = 0;
  const written: Written[] = [];
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const push = (b: Buffer) => { controller.enqueue(new Uint8Array(b)); offset += b.length; };
        for (const e of entries) {
          const name = Buffer.from(e.name, 'utf8');
          const t = dosTime(e.date);
          const start = offset;
          push(localHeader(name, t));
          let crc = 0;
          let size = 0;
          const reader = (await e.open()).getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            crc = crc32(value, crc);
            size += value.byteLength;
            if (offset + value.byteLength > ZIP_MAX_TOTAL) throw new Error('zip.too_large');
            controller.enqueue(value);
            offset += value.byteLength;
          }
          push(descriptor(crc, size));
          written.push({ name, crc, size, offset: start, t });
        }
        const cdStart = offset;
        for (const w of written) push(centralEntry(w));
        push(endRecord(written.length, offset - cdStart, cdStart));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/** نامِ تکراری ← «نام (۲).ext»؛ اسلش و نویسه‌های مسیر حذف (بی پیمایشِ مسیر هنگامِ بازکردن). */
export function uniqueZipNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    const clean = (raw.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\.{2,}/g, '').replace(/^[._\s]+/, '').trim() || 'file').slice(0, 180);
    const key = clean.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 1) return clean;
    const dot = clean.lastIndexOf('.');
    return dot > 0 ? `${clean.slice(0, dot)} (${n})${clean.slice(dot)}` : `${clean} (${n})`;
  });
}
