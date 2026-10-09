import { describe, it, expect } from 'vitest';
import { groupBy4, normalizeAccountNumber, normalizeCard, normalizeIban } from './bank';

describe('مشخصاتِ بانکی', () => {
  it('IBAN: فاصله و حروفِ کوچک پذیرفته؛ رقمِ کنترلیِ اشتباه رد', () => {
    expect(normalizeIban('de89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000');
    expect(normalizeIban('GB82 WEST 1234 5698 7654 32')).toBe('GB82WEST12345698765432');
    expect(normalizeIban('DE88370400440532013000')).toBeNull();
    expect(normalizeIban('IR12')).toBeNull();
    expect(normalizeIban('')).toBe('');
  });

  it('کارت: ارقامِ فارسی و فاصله پذیرفته؛ Luhn ِ نادرست رد', () => {
    expect(normalizeCard('4111 1111 1111 1111')).toBe('4111111111111111');
    expect(normalizeCard('۴۱۱۱-۱۱۱۱-۱۱۱۱-۱۱۱۱')).toBe('4111111111111111');
    expect(normalizeCard('4111111111111112')).toBeNull();
    expect(normalizeCard('1234')).toBeNull();
  });

  it('شمارهٔ حساب: رقم و خط تیره', () => {
    expect(normalizeAccountNumber(' ۰۱۲۳-۴۵۶۷۸۹-۱ ')).toBe('0123-456789-1');
    expect(normalizeAccountNumber('abc')).toBeNull();
  });

  it('گروه‌های چهارتایی', () => {
    expect(groupBy4('4111111111111111')).toBe('4111 1111 1111 1111');
    expect(groupBy4('DE89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });
});
