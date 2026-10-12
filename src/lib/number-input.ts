/**
 * سه‌رقم‌سه‌رقم کردنِ خانه‌های مبلغ (۲.۲۵.۰).
 *
 * `ungroupDigits` عددِ خام می‌سازد: رقمِ فارسی/عربی ← لاتین، جداکنندهٔ اعشارِ
 * فارسی «٫» ← «.»، ویرگول‌ها و هر نویسهٔ دیگری حذف؛ فقط یک نقطه و منفیِ ابتدا
 * می‌ماند. `groupDigits` بخشِ صحیح را با ویرگول جدا می‌کند و اعشار را دست نمی‌زند
 * (نرخِ ۰٫۰۰۰۰۵ نباید گرد شود).
 */

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';

export function ungroupDigits(value: string): string {
  let out = '';
  let dot = false;
  for (const [i, ch] of [...value].entries()) {
    const p = PERSIAN.indexOf(ch);
    const a = ARABIC.indexOf(ch);
    if (p >= 0) out += String(p);
    else if (a >= 0) out += String(a);
    else if (ch >= '0' && ch <= '9') out += ch;
    else if ((ch === '.' || ch === '٫') && !dot) { out += '.'; dot = true; }
    else if (ch === '-' && i === 0) out += '-';
  }
  return out;
}

export function groupDigits(raw: string): string {
  if (raw === '' || raw === '-') return raw;
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const [int = '', frac] = body.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${frac !== undefined ? `.${frac}` : ''}`;
}
