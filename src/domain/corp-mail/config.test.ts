import { describe, expect, it } from 'vitest';
import {
  addressOf, cleanHttpsUrl, isReserved, localPartProblem, normalizeCorpMail, parseReserved, quotaBytes,
} from './config';

describe('ایمیلِ شرکتی — قواعد', () => {
  const config = normalizeCorpMail({ domain: 'Example.com', reserved: ['contact'] });

  it('دامنه کوچک می‌شود و دامنهٔ خراب خالی', () => {
    expect(config.domain).toBe('example.com');
    expect(normalizeCorpMail({ domain: 'not a domain' }).domain).toBe('');
    expect(normalizeCorpMail({ domain: '@example.com' }).domain).toBe('example.com');
  });

  it('⚠️ نام‌های رزرو و همیشه‌رزرو ساخته نمی‌شوند', () => {
    expect(localPartProblem('contact', config)).toBe('reserved');
    expect(localPartProblem('Admin', config)).toBe('invalid'); // حروفِ بزرگ پیش از نرمال‌سازی
    expect(isReserved('Admin', config)).toBe(true);
    expect(isReserved('postmaster', normalizeCorpMail({ reserved: [] }))).toBe(true);
    expect(localPartProblem('sara', config)).toBeNull();
  });

  it('نامِ نامعتبر رد می‌شود', () => {
    for (const bad of ['', 'a b', 'sara@x', '.sara', 'sara.', 'sa..ra', 'سارا']) {
      expect(localPartProblem(bad, config)).not.toBeNull();
    }
    expect(localPartProblem('sara.ahmadi', config)).toBeNull();
    expect(localPartProblem('s_a-1', config)).toBeNull();
  });

  it('فهرستِ رزرو از متنِ آزاد', () => {
    expect(parseReserved('contact, finance@example.com، Sales\nsales  ؟؟')).toEqual(['contact', 'finance', 'sales']);
  });

  it('سهمیه، پورت و لینکِ وب‌میل', () => {
    expect(quotaBytes({ quotaGb: 5 })).toBe(5368709120);
    expect(normalizeCorpMail({ quotaGb: '-3' }).quotaGb).toBe(5);
    expect(normalizeCorpMail({ imapPort: '99999' }).imapPort).toBe(993);
    expect(cleanHttpsUrl('mail.example.com')).toBe('https://mail.example.com');
    expect(cleanHttpsUrl('javascript:alert(1)')).toBe('');
    expect(cleanHttpsUrl('http://mail.example.com')).toBe('');
  });

  it('نشانیِ کامل', () => {
    expect(addressOf(' Sara ', config)).toBe('sara@example.com');
  });
});

describe('IPهای مجاز', () => {
  it('IPv4 و CIDR ِ معتبر، بقیه دور ریخته می‌شوند', async () => {
    const { parseIpList } = await import('./config');
    expect(parseIpList('10.0.4.0/24, 203.0.113.7 300.1.1.1 10.0.4.0/33 a.b 10.0.4.0/24'))
      .toEqual(['10.0.4.0/24', '203.0.113.7']);
  });
});
