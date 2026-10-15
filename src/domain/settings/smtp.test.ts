import { describe, it, expect } from 'vitest';
import { EMPTY_SMTP, isValidSmtpHost, normalizeFrom, normalizeSmtp, resolveSmtp, smtpFingerprint } from './smtp';

describe('ایمیلِ خروجی از پنل (۲.۳۲.۰)', () => {
  it('اعتبارسنجیِ میزبان، پورت و فرستنده', () => {
    expect(isValidSmtpHost('smtp.example.com')).toBe(true);
    expect(isValidSmtpHost('https://smtp.x.com')).toBe(false);
    expect(isValidSmtpHost('a b')).toBe(false);
    expect(normalizeSmtp({ host: 'smtp.x.com', port: '99999' }).port).toBe(587);
    expect(normalizeFrom('Kabarza <no-reply@x.com>')).toBe('Kabarza <no-reply@x.com>');
    expect(normalizeFrom('no-reply@x.com')).toBe('no-reply@x.com');
    expect(normalizeFrom('nope')).toBe('');
  });

  it('پنل: فرستندهٔ خالی ← نامِ کاربری؛ بی‌میزبان ← خاموش', () => {
    const stored = { ...EMPTY_SMTP, host: 'smtp.x.com', port: 465, user: 'me@x.com' };
    expect(resolveSmtp({}, stored, 'pw')).toEqual({ host: 'smtp.x.com', port: 465, user: 'me@x.com', pass: 'pw', from: 'me@x.com' });
    expect(resolveSmtp({}, EMPTY_SMTP, null)).toBeNull();
  });

  it('⚠️ محیط برنده است — همه با هم، نه نیمی از پنل', () => {
    const stored = { ...EMPTY_SMTP, host: 'panel.x.com', user: 'panel@x.com', from: 'panel@x.com' };
    const r = resolveSmtp({ host: 'env.x.com', user: 'env@x.com', password: 'e' }, stored, 'panel-pw');
    expect(r).toEqual({ host: 'env.x.com', port: 587, user: 'env@x.com', pass: 'e', from: 'env@x.com' });
  });

  it('اثرِ انگشت با تغییرِ رمز عوض می‌شود (ترابر دوباره ساخته شود)', () => {
    const a = resolveSmtp({}, { ...EMPTY_SMTP, host: 'h.x.com' }, 'one');
    const b = resolveSmtp({}, { ...EMPTY_SMTP, host: 'h.x.com' }, 'two');
    expect(smtpFingerprint(a)).not.toBe(smtpFingerprint(b));
    expect(smtpFingerprint(null)).toBe('');
  });
});
