/**
 * پروفایلِ کاربر — اطلاعاتِ بانکی، منطقهٔ زمانی، و اتصالِ تلگرام.
 *
 * منبع: ·
 *
 */

/* ------------------------------------------------------------------ *
 * اطلاعاتِ بانکی
 * ------------------------------------------------------------------ */

export interface BankInfo {
  account: string;
  iban: string;
  card: string;
}

/**
 * ⚠️ هر سه فیلد **متنِ آزاد**اند و عمداً اعتبارسنجیِ سخت‌گیرانه ندارند:
 * نسخهٔ قبلی هم همین کار را می‌کند. قالبِ شبا و شمارهٔ کارت کشور به کشور فرق
 * می‌کند و ردکردنِ یک شمارهٔ درستِ خارجی بدتر از پذیرفتنِ یک شمارهٔ ناقص است.
 * فقط فاصله‌های اضافی و نویسه‌های کنترلی پاک می‌شوند.
 */
export function normalizeBankInfo(input: Partial<BankInfo>): BankInfo {
  const clean = (value: string | undefined) =>
    (value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);

  return {
    account: clean(input.account),
    iban: clean(input.iban),
    card: clean(input.card),
  };
}

/** آیا اطلاعاتِ پرداخت ثبت شده؟ حتی یکی از سه فیلد کافی است. */
export function hasBankInfo(info: BankInfo): boolean {
  return Boolean(info.account || info.iban || info.card);
}

/** نمایشِ کوتاه‌شدهٔ شمارهٔ کارت — فقط چهار رقمِ آخر. */
export function maskCard(card: string): string {
  const digits = card.replace(/\D/g, '');
  if (digits.length < 4) return card;
  return `•••• ${digits.slice(-4)}`;
}

/* ------------------------------------------------------------------ *
 * منطقهٔ زمانی
 * ------------------------------------------------------------------ */

/**
 * منطقه‌های زمانیِ پیشنهادی.
 * ⚠️ فهرست کوتاه است ولی مقدارِ دلخواه هم پذیرفته می‌شود؛ رشتهٔ نامعتبر به
 * «پیش‌فرضِ سامانه» برمی‌گردد، نه اینکه ساعت را خراب کند.
 */
/**
 * مناطقی که بیشتر لازم می‌شوند — سرِ فهرست می‌آیند تا کاربرِ ایرانی
 * «Asia/Tehran» را در سطرِ اول ببیند، نه بینِ چهارصد منطقهٔ الفبایی.
 */
export const COMMON_TIMEZONES = [
  'Asia/Tehran', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/London',
  'Asia/Dubai', 'America/New_York', 'UTC',
] as const;

/**
 * **همهٔ** مناطقِ زمانیِ دنیا، با پرکاربردها در بالا.
 *
 * ⚠️ چرا فهرستِ کوتاه کافی نبود: `isValidTimezone` هر منطقهٔ معتبری را
 * می‌پذیرد، پس محدودیت فقط در **پیشنهاد** بود — کاربری در توکیو یا سائوپائولو
 * باید نامِ منطقه‌اش را از حفظ تایپ می‌کرد.
 *
 * ⚠️ `supportedValuesOf` در نودِ قدیمی‌تر نیست؛ نبودش نباید صفحه را بشکند،
 * پس به همان فهرستِ کوتاه برمی‌گردیم.
 */
export function allTimezones(): string[] {
  let all: string[] = [];
  try {
    const supported = (Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    }).supportedValuesOf;
    if (typeof supported === 'function') all = supported('timeZone');
  } catch {
    all = [];
  }
  if (all.length === 0) return [...COMMON_TIMEZONES];

  const common = new Set<string>(COMMON_TIMEZONES);
  return [...COMMON_TIMEZONES, ...all.filter((tz) => !common.has(tz))];
}

export function isValidTimezone(value: string): boolean {
  if (!value) return true; // خالی = پیش‌فرضِ سامانه
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(value: string): string {
  const trimmed = value.trim();
  return isValidTimezone(trimmed) ? trimmed : '';
}

/* ------------------------------------------------------------------ *
 * اتصالِ تلگرام
 * ------------------------------------------------------------------ */

export type TelegramState = 'unavailable' | 'disconnected' | 'connected';

/**
 * وضعیتِ تلگرام.
 * ⚠️ اگر توکنِ بات تنظیم نشده باشد، بخش اصلاً نمایش داده نمی‌شود
 * (`unavailable`) — نه اینکه دکمه‌ای بدهیم که همیشه شکست بخورد.
 */
export function telegramState(input: {
  botConfigured: boolean;
  chatId: string;
}): TelegramState {
  if (!input.botConfigured) return 'unavailable';
  return input.chatId ? 'connected' : 'disconnected';
}

/**
 * پیوندِ عمیقِ اتصال: کاربر بات را باز می‌کند و توکن به‌عنوانِ پارامترِ
 * `start` می‌رود؛ بات همان توکن را به حسابِ کاربر گره می‌زند.
 *
 * ⚠️ توکن باید **یک‌بارمصرف و غیرقابلِ‌حدس** باشد — هر کسی که توکن را داشته
 * باشد می‌تواند اعلان‌های آن کاربر را به چتِ خودش وصل کند.
 */
export function connectDeeplink(botUsername: string, token: string): string | null {
  const user = botUsername.replace(/^@/, '').trim();
  if (!user || !token) return null;
  return `https://t.me/${encodeURIComponent(user)}?start=${encodeURIComponent(token)}`;
}
