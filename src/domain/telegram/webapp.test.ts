import { describe, it, expect } from 'vitest';
import { signInitData, verifyInitData, decodeStartParam, encodeStartParam, miniAppDirectLink } from './webapp';

const TOKEN = '123456:test-bot-token';
const NOW = 1_800_000_000;
const fields = (over: Record<string, string> = {}) => ({
  auth_date: String(NOW - 10), query_id: 'AAE', user: JSON.stringify({ id: 4242, first_name: 'سارا' }), ...over,
});

describe('initData ِ مینی‌اپ', () => {
  it('امضای درست ← شناسهٔ کاربرِ تلگرام', () => {
    expect(verifyInitData(signInitData(fields(), TOKEN), TOKEN, NOW)).toEqual({ ok: true, telegramUserId: 4242, authDate: NOW - 10, startParam: '' });
  });

  it('دست‌کاری، توکنِ دیگر، یا بی‌امضا رد می‌شود', () => {
    const good = signInitData(fields(), TOKEN);
    const forged = good.replace(encodeURIComponent('4242'), encodeURIComponent('4243'));
    expect(verifyInitData(forged, TOKEN, NOW)).toMatchObject({ ok: false, reason: 'bad_signature' });
    expect(verifyInitData(good, '999:other', NOW)).toMatchObject({ ok: false, reason: 'bad_signature' });
    expect(verifyInitData(new URLSearchParams(fields()).toString(), TOKEN, NOW)).toMatchObject({ ok: false, reason: 'malformed' });
    expect(verifyInitData('', TOKEN, NOW).ok).toBe(false);
    expect(verifyInitData(good, '', NOW).ok).toBe(false);
  });

  it('کهنه یا از آینده رد می‌شود', () => {
    expect(verifyInitData(signInitData(fields({ auth_date: String(NOW - 7200) }), TOKEN), TOKEN, NOW)).toMatchObject({ reason: 'expired' });
    expect(verifyInitData(signInitData(fields({ auth_date: String(NOW + 3600) }), TOKEN), TOKEN, NOW)).toMatchObject({ reason: 'expired' });
  });

  it('کاربرِ بی‌شناسه رد می‌شود', () => {
    expect(verifyInitData(signInitData(fields({ user: '{}' }), TOKEN), TOKEN, NOW)).toMatchObject({ reason: 'malformed' });
    expect(verifyInitData(signInitData(fields({ user: 'x' }), TOKEN), TOKEN, NOW)).toMatchObject({ reason: 'malformed' });
  });
});

describe('لینکِ مستقیمِ مینی‌اپ (۲.۴۰.۰)', () => {
  it('مسیرِ داخلی رفت‌وبرگشت دارد و فقط نویسه‌های مجازِ تلگرام', () => {
    const start = encodeStartParam('/projects/42?tab=tasks')!;
    expect(start).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeStartParam(start)).toBe('/projects/42?tab=tasks');
    expect(miniAppDirectLink('kabarzateambot', 'crm', '/projects/42?tab=tasks'))
      .toBe(`https://t.me/kabarzateambot/crm?startapp=${start}`);
  });

  it('مقصدِ بیرونی یا خراب پذیرفته نمی‌شود', () => {
    expect(decodeStartParam(encodeStartParam('//evil.com')!)).toBeNull();
    expect(decodeStartParam(encodeStartParam('https://evil.com')!)).toBeNull();
    expect(decodeStartParam('not valid!')).toBeNull();
    expect(miniAppDirectLink('b', 'crm', '/x')).toBeNull();
  });

  it('start_param ِ امضاشده از initData خوانده می‌شود', () => {
    const token = '123:ABC';
    const now = Math.floor(Date.now() / 1000);
    const data = signInitData({ auth_date: String(now), user: JSON.stringify({ id: 7 }), start_param: 'abc' }, token);
    const out = verifyInitData(data, token);
    expect(out.ok && out.startParam).toBe('abc');
  });
});
