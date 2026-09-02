/**
 * تنظیماتِ سامانه — پورتِ آرایهٔ نسخهٔ قبلی
 * (`Admin\، شاخهٔ `save_settings`).
 *
 * ⚠️ هر مقدار **مهار** می‌شود، نه اینکه هرچه در فرم بود ذخیره شود. نسخهٔ قبلی هم
 * همین کار را می‌کند و دلیلش عملیاتی است: فاصلهٔ ضربانِ دلخواه (مثلاً ۱ ثانیه)
 * روی سرور خودش می‌شود حمله. پس هر عددِ خارج از فهرستِ مجاز به پیش‌فرض
 * برمی‌گردد — نه خطا، تا فرمِ نیمه‌درست کلِ تنظیمات را زمین نزند.
 *
 * گزینه‌هایی که عمداً **منتقل نشده‌اند** (وابسته به سامانهٔ قبلی، نه به قابلیت):
 * · `dashboard_page` / `dashboard_layout` — انتخابِ برگهٔ سامانهٔ قبلی و قالبِ آن.
 * · `login_gate` — کلِ KabarzaOS پشتِ ورود است؛ حالتِ «سایتِ عمومی» ندارد.
 * · `cpt_menu` — منویِ CPT ِ سامانهٔ قبلی.
 * این‌ها در docs/PARITY-CHECKLIST.md هم ثبت شده‌اند.
 */

import {
  IDLE_CHOICES, OFFLINE_CHOICES, PING_CHOICES, PRESENCE_DEFAULTS,
} from '@/domain/people/presence';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';

/** ثانیه — همان مقادیرِ `Messages::PULSE_*` و `CHATPOLL_*`. */
export const PULSE_CHOICES = [30, 45, 60, 120] as const;
export const CHATPOLL_CHOICES = [5, 7, 10, 15] as const;

/** بیشینهٔ نگهداریِ پیام‌ها — نسخهٔ قبلی روی ۳۶۵ روز مهار می‌کند. */
export const MAX_PURGE_DAYS = 365;

export interface SystemConfig {
  /** نامِ برند؛ روی فاکتور و سربرگ می‌نشیند. */
  brandName: string;
  /**
   * زبانِ پیش‌فرضِ پنل — پورتِ `default_locale`.
   *
   * ⚠️ این زبانِ کسانی است که **خودشان انتخابی نکرده‌اند**؛ انتخابِ کاربر
   * همیشه بالاتر می‌نشیند (R-I18N-14).
   */
  defaultLocale: Locale;
  /** ۰ = شنبه … ۶ = جمعه. */
  weekStart: number;
  /**
   * منطقهٔ زمانیِ **سامانه** (IANA) — پورتِ منطقهٔ سایتِ نسخهٔ قبلی: ساعتِ
   * ارسالِ گزارشِ روزانه و «امروز» ِ آن با همین سنجیده می‌شود. خالی یعنی
   * مقدارِ محیط (`APP_TIMEZONE`) و در نبودش UTC.
   */
  timezone: string;
  /** حضورِ زنده روشن است؟ */
  presenceEnabled: boolean;
  presencePing: number;
  presenceIdle: number;
  presenceOffline: number;
  /** پاک‌سازیِ خودکارِ پیام‌های قدیمی؛ ۰ = هرگز. */
  msgPurgeDays: number;
  pulseEnabled: boolean;
  pulseInterval: number;
  chatPollEnabled: boolean;
  chatPollInterval: number;
}

export const DEFAULT_SYSTEM: SystemConfig = {
  brandName: '',
  defaultLocale: DEFAULT_LOCALE,
  weekStart: 0,
  timezone: '',
  presenceEnabled: true,
  presencePing: PRESENCE_DEFAULTS.ping,
  presenceIdle: PRESENCE_DEFAULTS.idleAfter,
  presenceOffline: PRESENCE_DEFAULTS.offlineAfter,
  msgPurgeDays: 0,
  pulseEnabled: true,
  pulseInterval: 45,
  chatPollEnabled: true,
  chatPollInterval: 7,
};

function fromChoices(value: unknown, choices: readonly number[], fallback: number): number {
  const n = Number(value);
  return choices.includes(n) ? n : fallback;
}

/** منطقهٔ نامعتبر ذخیره نمی‌شود — گزارشِ روزانه با منطقهٔ خراب هرگز شلیک نمی‌کرد. */
function zone(value: unknown): string {
  const v = String(value ?? '').trim();
  if (v === '') return '';
  try { new Intl.DateTimeFormat('en', { timeZone: v }); return v; } catch { return ''; }
}

function bool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  // ⚠️ نسخهٔ قبلی رشتهٔ '0' را خاموش می‌داند؛ در JS ‏'0' ِ خام truthy است.
  if (value === '0' || value === 0 || value === false) return false;
  if (value === '1' || value === 1 || value === true) return true;
  return fallback;
}

/** مقدارِ امن — هر ورودیِ نامعتبر به پیش‌فرض برمی‌گردد. */
export function normalizeSystem(input: Partial<Record<keyof SystemConfig, unknown>>): SystemConfig {
  const week = Number(input.weekStart);

  return {
    brandName: String(input.brandName ?? '').trim().slice(0, 120),
    // ⚠️ زبانِ ناشناخته به پیش‌فرض برمی‌گردد، نه اینکه ذخیره شود: مقدارِ
    // بی‌ترجمه یعنی کاربرانی که انتخابی نکرده‌اند رابطِ خالی می‌بینند.
    defaultLocale: isLocale(String(input.defaultLocale ?? ''))
      ? (String(input.defaultLocale) as Locale)
      : DEFAULT_SYSTEM.defaultLocale,
    weekStart: Number.isInteger(week) && week >= 0 && week <= 6 ? week : DEFAULT_SYSTEM.weekStart,
    timezone: zone(input.timezone),
    presenceEnabled: bool(input.presenceEnabled, DEFAULT_SYSTEM.presenceEnabled),
    presencePing: fromChoices(input.presencePing, PING_CHOICES, DEFAULT_SYSTEM.presencePing),
    presenceIdle: fromChoices(input.presenceIdle, IDLE_CHOICES, DEFAULT_SYSTEM.presenceIdle),
    presenceOffline: fromChoices(
      input.presenceOffline, OFFLINE_CHOICES, DEFAULT_SYSTEM.presenceOffline,
    ),
    // ⚠️ مهار در **هر دو** سو: عددِ منفی یعنی «همه را پاک کن».
    msgPurgeDays: Math.max(0, Math.min(MAX_PURGE_DAYS, Math.trunc(Number(input.msgPurgeDays) || 0))),
    pulseEnabled: bool(input.pulseEnabled, DEFAULT_SYSTEM.pulseEnabled),
    pulseInterval: fromChoices(input.pulseInterval, PULSE_CHOICES, DEFAULT_SYSTEM.pulseInterval),
    chatPollEnabled: bool(input.chatPollEnabled, DEFAULT_SYSTEM.chatPollEnabled),
    chatPollInterval: fromChoices(
      input.chatPollInterval, CHATPOLL_CHOICES, DEFAULT_SYSTEM.chatPollInterval,
    ),
  };
}
