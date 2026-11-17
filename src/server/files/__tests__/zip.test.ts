import { describe, expect, it } from 'vitest';
import { crc32 } from 'node:zlib';
import { uniqueZipNames, zipStream } from '../zip';

const streamOf = (text: string) => async () => new Response(text).body!;

async function bytes(s: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(s).arrayBuffer());
}

/** central directory را می‌خواند — همان کاری که برنامهٔ بازکنندهٔ zip می‌کند. */
function readCentral(zip: Buffer) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out: Array<{ name: string; crc: number; size: number; offset: number }> = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const nameLen = zip.readUInt16LE(p + 28);
    out.push({
      crc: zip.readUInt32LE(p + 16),
      size: zip.readUInt32LE(p + 20),
      offset: zip.readUInt32LE(p + 42),
      name: zip.subarray(p + 46, p + 46 + nameLen).toString('utf8'),
    });
    p += 46 + nameLen;
  }
  return out;
}

describe('zipStream — بایگانیِ جریانی', () => {
  it('نام‌های فارسی، CRC، اندازه و جای هر فایل درست است', async () => {
    const zip = await bytes(zipStream([
      { name: 'قرارداد.txt', date: new Date('2026-11-17T10:00:00'), open: streamOf('سلام') },
      { name: 'b.txt', date: new Date('2026-11-17T10:00:00'), open: streamOf('hello world') },
    ]));
    const entries = readCentral(zip);
    expect(entries.map((e) => e.name)).toEqual(['قرارداد.txt', 'b.txt']);
    const hello = Buffer.from('hello world');
    expect(entries[1]!.size).toBe(hello.length);
    expect(entries[1]!.crc).toBe(crc32(hello) >>> 0);
    // دادهٔ فایل درست پس از سرآیندِ محلی است.
    const e = entries[1]!;
    const nameLen = zip.readUInt16LE(e.offset + 26);
    const data = zip.subarray(e.offset + 30 + nameLen, e.offset + 30 + nameLen + e.size);
    expect(data.toString()).toBe('hello world');
    // پرچمِ UTF-8 روشن است.
    expect(zip.readUInt16LE(e.offset + 6) & 0x0800).toBe(0x0800);
  });

  it('بایگانیِ خالی معتبر است', async () => {
    const zip = await bytes(zipStream([]));
    expect(zip.length).toBe(22);
    expect(readCentral(zip)).toEqual([]);
  });

  it('خطای خواندنِ یک فایل جریان را می‌شکند، نه zip ِ ناقصِ بی‌صدا', async () => {
    const bad = zipStream([{ name: 'x', date: new Date(), open: async () => { throw new Error('gone'); } }]);
    await expect(bytes(bad)).rejects.toThrow('gone');
  });
});

describe('uniqueZipNames', () => {
  it('تکراری‌ها شماره می‌گیرند و مسیر پاک می‌شود', () => {
    expect(uniqueZipNames(['a.pdf', 'A.pdf', 'a.pdf', '../../etc/passwd', 'x/y.png', '']))
      .toEqual(['a.pdf', 'A (2).pdf', 'a (3).pdf', 'etc_passwd', 'x_y.png', 'file']);
  });
});
