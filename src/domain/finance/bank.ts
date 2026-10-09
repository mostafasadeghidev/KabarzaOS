import { latinDigits } from '@/domain/projects/task-ref';

/**
 * مشخصاتِ بانکیِ حساب (۲.۱۸.۰) — شمارهٔ حساب، شمارهٔ بین‌المللی (IBAN/شبا) و
 * شمارهٔ کارت. ورودی با ارقامِ فارسی/عربی و فاصله پذیرفته و یکدست ذخیره می‌شود؛
 * نمایش گروه‌های چهاررقمی است. همه اختیاری‌اند (خالی = ثبت نشده).
 */

/** فقط حروف و ارقامِ لاتین، بزرگ. */
function compact(input: string): string {
  return latinDigits(input).replace(/[\s\-_.]/g, '').toUpperCase();
}

/**
 * IBAN ← استاندارد، یا null اگر نامعتبر. ⚠️ با رقمِ کنترلی (mod 97) سنجیده
 * می‌شود؛ یک رقمِ اشتباه یعنی پولی که به حسابِ دیگری می‌رود.
 * شبای ایرانی (IR + ۲۴ رقم) هم همین است.
 */
export function normalizeIban(input: string): string | null {
  const iban = compact(input);
  if (iban === '') return '';
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return null;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1 ? iban : null;
}

/** شمارهٔ کارت ← ۱۶ تا ۱۹ رقم با رقمِ کنترلیِ درست (Luhn)، یا null. */
export function normalizeCard(input: string): string | null {
  const card = compact(input);
  if (card === '') return '';
  if (!/^\d{16,19}$/.test(card)) return null;
  let sum = 0;
  for (let i = 0; i < card.length; i++) {
    let d = Number(card[card.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0 ? card : null;
}

/** شمارهٔ حساب ← رقم و خط تیره (قالبِ بانک‌ها فرق دارد)، تا ۳۴ نویسه؛ یا null. */
export function normalizeAccountNumber(input: string): string | null {
  const n = latinDigits(input).trim().replace(/\s+/g, '');
  if (n === '') return '';
  return /^[0-9][0-9\-.\/]{0,33}$/.test(n) ? n : null;
}

/** نمایشِ گروه‌های چهارتایی — «IR06 0170 …»، «6037 9911 …». */
export function groupBy4(value: string): string {
  return value.replace(/(.{4})(?=.)/g, '$1 ');
}
