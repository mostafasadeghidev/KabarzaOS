import { describe, expect, it } from 'vitest';
import { CHUNK_SIZES, STALL_MS, UploadError, uploadFile, type UploadDeps } from './restore-upload';

/**
 * سرورِ ساختگی با همان قاعدهٔ appendChunk: تکه فقط وقتی پذیرفته می‌شود که جایش
 * دقیقاً پایانِ فایلِ فعلی باشد، وگرنه offset ِ درست را برمی‌گرداند.
 * `plan` برای هر درخواست می‌گوید چه پیش بیاید.
 */
type Outcome = 'ok' | 'network' | 'timeout' | 'lost-response' | 'tooLarge' | 'token' | 'gateway';

function fakeServer(plan: Outcome[], initial = 0) {
  let size = initial;
  let clock = 0;
  const sizes: number[] = [];
  const deps: UploadDeps = {
    fetch: (async (_url: string, init: RequestInit) => {
      const outcome = plan.shift() ?? 'ok';
      const offset = Number((init.headers as Record<string, string>)['x-offset']);
      const body = init.body as Blob;
      sizes.push(body.size);
      const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
      if (outcome === 'network') throw new TypeError('Failed to fetch');
      if (outcome === 'timeout') return new Response('', { status: 524 });
      if (outcome === 'gateway') return new Response('<html>bad gateway</html>', { status: 502 });
      if (outcome === 'tooLarge') return json(413, { error: 'size' });
      if (outcome === 'token') return json(403, { error: 'token' });
      if (offset !== size) return json(400, { error: 'offset', expected: size });
      size += body.size;
      // تکه رسید ولی پاسخ گم شد (پراکسی زودتر بُرید).
      if (outcome === 'lost-response') throw new TypeError('network');
      return json(200, { size });
    }) as unknown as typeof fetch,
    sleep: async (ms) => { clock += ms; },
    now: () => clock,
    waitOnline: async () => undefined,
    aborted: () => false,
  };
  return { deps, sizes, get size() { return size; }, tick: (ms: number) => { clock += ms; } };
}

const hooks = () => {
  const progress: number[] = [];
  const waits: boolean[] = [];
  return { progress, waits, onProgress: (n: number) => progress.push(n), onWaiting: (w: boolean) => waits.push(w) };
};

const file = (mb: number) => new Blob([new Uint8Array(mb * 1024 * 1024)]);

describe('uploadFile', () => {
  it('بی‌قطعی همهٔ فایل را با تکهٔ بزرگ می‌فرستد', async () => {
    const s = fakeServer([]);
    await uploadFile(file(20), 't', s.deps, hooks());
    expect(s.size).toBe(20 * 1024 * 1024);
    expect(s.sizes[0]).toBe(CHUNK_SIZES[0]);
  });

  it('پس از قطعیِ شبکه و ۵۰۲ ادامه می‌دهد و به‌جای ایستادن صبر می‌کند', async () => {
    const s = fakeServer(['ok', 'network', 'gateway', 'network', 'ok']);
    const h = hooks();
    await uploadFile(file(20), 't', s.deps, h);
    expect(s.size).toBe(20 * 1024 * 1024);
    expect(h.waits).toContain(true);
    expect(h.waits.at(-1)).toBe(false);
  });

  it('سقفِ زمانیِ پراکسی (۵۲۴) تکه را کوچک‌تر می‌کند', async () => {
    const s = fakeServer(['timeout', 'timeout']);
    await uploadFile(file(10), 't', s.deps, hooks());
    expect(s.sizes.slice(0, 3)).toEqual([CHUNK_SIZES[0], CHUNK_SIZES[1], CHUNK_SIZES[2]]);
    expect(s.size).toBe(10 * 1024 * 1024);
  });

  it('تکه‌ای که رسید ولی پاسخش گم شد دوباره افزوده نمی‌شود', async () => {
    const s = fakeServer(['lost-response']);
    await uploadFile(file(10), 't', s.deps, hooks());
    expect(s.size).toBe(10 * 1024 * 1024);
  });

  it('ادامه پس از تازه‌کردنِ صفحه: از جایی که سرور دارد، نه از صفر', async () => {
    const s = fakeServer([], 8 * 1024 * 1024);
    const h = hooks();
    await uploadFile(file(10), 't', s.deps, h);
    expect(s.size).toBe(10 * 1024 * 1024);
    expect(h.progress[0]).toBe(8 * 1024 * 1024);
  });

  it('413 یک‌باره به کوچک‌ترین تکه می‌رود', async () => {
    const s = fakeServer(['tooLarge']);
    await uploadFile(file(1), 't', s.deps, hooks());
    expect(s.sizes[1]).toBe(CHUNK_SIZES.at(-1));
  });

  it('ژتونِ باطل بی‌تلاشِ بیهوده با کدِ token برمی‌گردد', async () => {
    const s = fakeServer(['token']);
    await expect(uploadFile(file(1), 't', s.deps, hooks())).rejects.toEqual(new UploadError('token'));
  });

  it('اگر مدتِ طولانی هیچ پیشرفتی نباشد با stalled می‌ایستد', async () => {
    const s = fakeServer(Array<Outcome>(500).fill('network'));
    await expect(uploadFile(file(1), 't', s.deps, hooks())).rejects.toEqual(new UploadError('stalled'));
    expect(s.deps.now()).toBeGreaterThan(STALL_MS);
  });
});
