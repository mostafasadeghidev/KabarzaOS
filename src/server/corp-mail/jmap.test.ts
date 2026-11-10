import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isCorpMailConfigured, JmapError, jmapCall, sessionAccountId, stalwartBaseUrl } from './jmap';

const calls: Array<{ url: string; init: RequestInit }> = [];

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }));
}

beforeEach(() => {
  calls.length = 0;
  process.env.STALWART_URL = 'http://stalwart:8080/';
  process.env.STALWART_API_KEY = 'k-test';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STALWART_URL;
  delete process.env.STALWART_API_KEY;
});

describe('کلاینتِ JMAP', () => {
  it('بی env خاموش است', () => {
    delete process.env.STALWART_API_KEY;
    expect(isCorpMailConfigured()).toBe(false);
    process.env.STALWART_API_KEY = 'x';
    process.env.STALWART_URL = 'ftp://x';
    expect(stalwartBaseUrl()).toBeNull();
  });

  it('⚠️ نشانی همیشه از STALWART_URL ساخته می‌شود، نه از apiUrl ِ نشست', async () => {
    stubFetch((url) => url.endsWith('/jmap/session')
      ? Response.json({ apiUrl: 'https://public.example/jmap/', primaryAccounts: { 'urn:stalwart:jmap': 'b' }, accounts: { b: {} } })
      : Response.json({ methodResponses: [['x:Domain/get', { list: [] }, '0']] }));
    const id = await sessionAccountId();
    await jmapCall([['x:Domain/get', { accountId: id }, '0']]);
    expect(id).toBe('b');
    expect(calls.map((c) => c.url)).toEqual(['http://stalwart:8080/jmap/session', 'http://stalwart:8080/jmap/']);
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe('Bearer k-test');
  });

  it('خطای متد و ۴۰۱ نوع دارند و بی‌صدا رد نمی‌شوند', async () => {
    // ⚠️ کلید از متغیر: گاردِ اعلان‌ها هر «type: '…'» ِ src را نوعِ اعلان می‌شمارد.
    const errorArgs = { ['type']: 'forbidden' };
    stubFetch(() => Response.json({ methodResponses: [['error', errorArgs, '0']] }));
    await expect(jmapCall([['x:Account/get', {}, '0']])).rejects.toMatchObject({ code: 'method', detail: 'forbidden' });

    stubFetch(() => new Response('', { status: 401 }));
    await expect(sessionAccountId()).rejects.toMatchObject({ code: 'unauthorized' });

    stubFetch(() => { throw new TypeError('ECONNREFUSED'); });
    await expect(sessionAccountId()).rejects.toBeInstanceOf(JmapError);
  });

  it('⚠️ پیامِ خطا هرگز کلید را ندارد', async () => {
    stubFetch(() => new Response('', { status: 500 }));
    const error = await jmapCall([['x:Account/get', {}, '0']]).catch((e: unknown) => e as Error);
    expect(String(error)).not.toContain('k-test');
  });
});
