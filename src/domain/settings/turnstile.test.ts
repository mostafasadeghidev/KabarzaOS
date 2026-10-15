import { describe, it, expect } from 'vitest';
import { EMPTY_TURNSTILE, isValidTurnstileKey, normalizeTurnstile, resolveTurnstile, siteverifyOk } from './turnstile';

const fp = (site: string, secret: string) => `${site}|${secret}`;
const SITE = '0x4AAAAAAAabcdefghijKLM';
const SECRET = '0x4AAAAAAAsecretSECRETsecret';

describe('کپچای کلودفلر (۲.۳۱.۰)', () => {
  it('شکلِ کلیدها: 0x… و کلیدِ آزمونیِ 1x…', () => {
    expect(isValidTurnstileKey(SITE)).toBe(true);
    expect(isValidTurnstileKey('1x00000000000000000000AA')).toBe(true);
    expect(isValidTurnstileKey('abc')).toBe(false);
    expect(isValidTurnstileKey('')).toBe(false);
    expect(normalizeTurnstile({ siteKey: 'bad', enabled: 'yes' })).toEqual({ ...EMPTY_TURNSTILE });
  });

  it('⚠️ روشن ولی آزموده‌نشده برای همین کلیدها = خاموش', () => {
    const stored = { siteKey: SITE, secretSealed: 'x', enabled: true, verifiedFor: '' };
    expect(resolveTurnstile({}, stored, SECRET, fp)).toBeNull();
    expect(resolveTurnstile({}, { ...stored, verifiedFor: fp(SITE, 'other') }, SECRET, fp)).toBeNull();
    expect(resolveTurnstile({}, { ...stored, verifiedFor: fp(SITE, SECRET) }, SECRET, fp)).toEqual({ siteKey: SITE, secret: SECRET });
  });

  it('خاموش در تنظیمات یا رازِ باز‌نشدنی = خاموش', () => {
    const stored = { siteKey: SITE, secretSealed: 'x', enabled: false, verifiedFor: fp(SITE, SECRET) };
    expect(resolveTurnstile({}, stored, SECRET, fp)).toBeNull();
    expect(resolveTurnstile({}, { ...stored, enabled: true }, null, fp)).toBeNull();
  });

  it('کلیدهای محیط مقدم‌اند؛ TURNSTILE_DISABLED همه را خاموش می‌کند', () => {
    const env = { siteKey: SITE, secret: SECRET };
    expect(resolveTurnstile(env, EMPTY_TURNSTILE, null, fp)).toEqual({ siteKey: SITE, secret: SECRET });
    expect(resolveTurnstile({ ...env, disabled: '1' }, EMPTY_TURNSTILE, null, fp)).toBeNull();
    const stored = { siteKey: SITE, secretSealed: 'x', enabled: true, verifiedFor: fp(SITE, SECRET) };
    expect(resolveTurnstile({ disabled: 'true' }, stored, SECRET, fp)).toBeNull();
  });

  it('پاسخِ siteverify: فقط success === true', () => {
    expect(siteverifyOk({ success: true })).toBe(true);
    expect(siteverifyOk({ success: false, 'error-codes': ['invalid-input-response'] })).toBe(false);
    expect(siteverifyOk(null)).toBe(false);
  });
});
