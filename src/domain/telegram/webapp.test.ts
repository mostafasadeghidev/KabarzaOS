import { describe, it, expect } from 'vitest';
import { signInitData, verifyInitData } from './webapp';

const TOKEN = '123456:test-bot-token';
const NOW = 1_800_000_000;
const fields = (over: Record<string, string> = {}) => ({
  auth_date: String(NOW - 10), query_id: 'AAE', user: JSON.stringify({ id: 4242, first_name: 'سارا' }), ...over,
});

describe('initData ِ مینی‌اپ', () => {
  it('امضای درست ← شناسهٔ کاربرِ تلگرام', () => {
    expect(verifyInitData(signInitData(fields(), TOKEN), TOKEN, NOW)).toEqual({ ok: true, telegramUserId: 4242, authDate: NOW - 10 });
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
