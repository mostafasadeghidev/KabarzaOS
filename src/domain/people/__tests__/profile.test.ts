import { describe, expect, it } from 'vitest';
import {
  connectDeeplink, hasBankInfo, isValidTimezone, maskCard,
  normalizeBankInfo, normalizeTimezone, telegramState,
} from '../profile';

describe('اطلاعاتِ بانکی', () => {
  it('⚠️ فاصله و خط‌تیره حفظ می‌شوند — همان‌طور که کاربر نوشته خواناتر است', () => {
    // نسخهٔ قبلی هم با sanitize_text_field فقط تگ و نویسهٔ کنترلی را می‌برد.
    expect(normalizeBankInfo({ card: '6037 9911 1234 5678' }).card).toBe('6037 9911 1234 5678');
    expect(normalizeBankInfo({ iban: 'IR12-0170-0000' }).iban).toBe('IR12-0170-0000');
  });

  it('نویسهٔ کنترلی پاک می‌شود تا در HTML و هدر مشکل نسازد', () => {
    expect(normalizeBankInfo({ account: 'AB\u0000CD\u001f' }).account).toBe('ABCD');
  });

  it('⚠️ قالبِ سخت‌گیرانه اعمال نمی‌شود — شمارهٔ خارجی نباید رد شود', () => {
    // ردکردنِ یک شمارهٔ درستِ خارجی بدتر از پذیرفتنِ یک شمارهٔ ناقص است.
    expect(normalizeBankInfo({ iban: 'DE89370400440532013000' }).iban)
      .toBe('DE89370400440532013000');
  });

  it('فیلدِ نداده خالی می‌شود، نه undefined', () => {
    expect(normalizeBankInfo({})).toEqual({ account: '', iban: '', card: '' });
  });

  it('حتی یک فیلد یعنی اطلاعاتِ پرداخت دارد', () => {
    expect(hasBankInfo({ account: '', iban: '', card: '' })).toBe(false);
    expect(hasBankInfo({ account: '', iban: 'IR1', card: '' })).toBe(true);
  });

  it('کارت فقط با چهار رقمِ آخر نشان داده می‌شود', () => {
    expect(maskCard('6037991112345678')).toBe('•••• 5678');
    expect(maskCard('12')).toBe('12');
  });
});

describe('منطقهٔ زمانی', () => {
  it('منطقهٔ معتبر پذیرفته می‌شود', () => {
    expect(isValidTimezone('Asia/Tehran')).toBe(true);
    expect(normalizeTimezone('Europe/Berlin')).toBe('Europe/Berlin');
  });

  it('خالی یعنی پیش‌فرضِ سامانه', () => {
    expect(isValidTimezone('')).toBe(true);
    expect(normalizeTimezone('   ')).toBe('');
  });

  it('⚠️ رشتهٔ نامعتبر به پیش‌فرض برمی‌گردد، نه اینکه ساعت را خراب کند', () => {
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(normalizeTimezone('Mars/Olympus')).toBe('');
  });
});

describe('اتصالِ تلگرام', () => {
  it('⚠️ بدونِ توکنِ بات، بخش اصلاً نمایش داده نمی‌شود', () => {
    // دکمه‌ای که همیشه شکست می‌خورد بدتر از نبودنش است.
    expect(telegramState({ botConfigured: false, chatId: '' })).toBe('unavailable');
    expect(telegramState({ botConfigured: false, chatId: '55' })).toBe('unavailable');
  });

  it('با بات: وصل یا قطع', () => {
    expect(telegramState({ botConfigured: true, chatId: '' })).toBe('disconnected');
    expect(telegramState({ botConfigured: true, chatId: '55' })).toBe('connected');
  });

  it('پیوندِ عمیق توکن را می‌برد', () => {
    expect(connectDeeplink('@KabarzaBot', 'abc123'))
      .toBe('https://t.me/KabarzaBot?start=abc123');
  });

  it('بدونِ بات یا توکن، پیوندی نیست', () => {
    expect(connectDeeplink('', 'abc')).toBeNull();
    expect(connectDeeplink('bot', '')).toBeNull();
  });

  it('نامِ بات و توکن encode می‌شوند', () => {
    expect(connectDeeplink('bot name', 'a b')).toBe('https://t.me/bot%20name?start=a%20b');
  });
});
