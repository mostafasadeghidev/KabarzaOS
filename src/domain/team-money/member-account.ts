/**
 * حسابِ اعضا (۲.۴۹.۰) — قرض، هدیه و هزینه‌ای که شرکت برای عضو داده، و تسویه‌شان.
 *
 * ⚠️ بدهی **به تفکیکِ ارز** است: قرضِ یورویی با بازپرداختِ ریالی خودکار جمع
 * نمی‌شود — همان قاعده‌ای که «مالیِ من» و گزارش‌ها دارند. تبدیل فقط جایی رخ
 * می‌دهد که کاربر صریحاً «معادل» می‌نویسد (کسر از دستمزدِ پروژه‌ای با ارزِ دیگر).
 */

export type MemberAccountKind = 'loan' | 'gift' | 'charge' | 'repayment' | 'offset' | 'forgive';

/** کدام نوع پولِ نقد دارد و از کدام سمت. */
export const CASH_KINDS = ['loan', 'gift', 'charge', 'repayment'] as const;

/** تسویه‌ها — هیچ‌کدام نباید از ماندهٔ بدهی بیشتر شود. */
export const SETTLE_KINDS = ['repayment', 'offset', 'forgive'] as const;

export const MEMBER_ACCOUNT_LABELS: Record<MemberAccountKind, string> = {
  loan: 'قرض',
  gift: 'هدیه',
  charge: 'هزینه برای عضو',
  repayment: 'بازپرداخت',
  offset: 'کسر از دستمزد',
  forgive: 'بخشیده‌شده',
};

/**
 * اثرِ هر نوع روی بدهی: + بدهی می‌سازد، − کم می‌کند، ۰ بی‌اثر.
 * ⚠️ هدیه ۰ است، نه منفی — هدیه بدهیِ دیگری را صاف نمی‌کند.
 */
export function debtSign(kind: MemberAccountKind): 1 | -1 | 0 {
  if (kind === 'loan' || kind === 'charge') return 1;
  if (kind === 'gift') return 0;
  return -1;
}

export function isSettlement(kind: MemberAccountKind): boolean {
  return (SETTLE_KINDS as readonly string[]).includes(kind);
}

/** ماندهٔ بدهی به تفکیکِ ارز — فقط ارزهایی که ردیف دارند. */
export function balancesByCurrency(
  rows: ReadonlyArray<{ kind: MemberAccountKind; amount: string; currencyId: number }>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) {
    const sign = debtSign(r.kind);
    if (sign === 0) continue;
    out.set(r.currencyId, round4((out.get(r.currencyId) ?? 0) + sign * Number(r.amount)));
  }
  return out;
}

/** جمعِ هدیه‌ها و بخشیده‌ها به تفکیکِ ارز — هر دو «پولی که برنمی‌گردد». */
export function giftsByCurrency(
  rows: ReadonlyArray<{ kind: MemberAccountKind; amount: string; currencyId: number }>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.kind !== 'gift' && r.kind !== 'forgive') continue;
    out.set(r.currencyId, round4((out.get(r.currencyId) ?? 0) + Number(r.amount)));
  }
  return out;
}

/** سهمِ عضو از یک مبلغ — `pct` درصد، چهار رقمِ اعشار. */
export function shareOf(amount: string, pct: string | number): string {
  return round4((Number(amount) * Number(pct)) / 100).toFixed(4);
}

export class MemberAccountError extends Error {
  constructor(
    readonly code:
      | 'not_found' | 'invalid_amount' | 'invalid_share' | 'over_balance'
      | 'not_member' | 'not_project_member' | 'no_account',
  ) {
    super(`member account refused: ${code}`);
    this.name = 'MemberAccountError';
  }
}

export const MEMBER_ACCOUNT_MESSAGES: Record<MemberAccountError['code'], string> = {
  not_found: 'ردیف پیدا نشد.',
  invalid_amount: 'مبلغ باید بیشتر از صفر باشد.',
  invalid_share: 'سهمِ عضو باید بینِ ۱ تا ۱۰۰ درصد باشد.',
  over_balance: 'این مبلغ از ماندهٔ بدهیِ عضو به همین ارز بیشتر است.',
  not_member: 'این شخص عضوِ تیم نیست.',
  not_project_member: 'این عضو در آن پروژه نیست.',
  no_account: 'حساب را انتخاب کنید.',
};

/** مبلغِ ورودیِ فرم — مثبت، حداکثر چهار رقمِ اعشار. */
export function parseAmount(raw: string): string {
  const text = raw.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,4})?$/.test(text) || !(Number(text) > 0)) throw new MemberAccountError('invalid_amount');
  return text;
}

export function parseShare(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || String(raw).trim() === '') return '100';
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0 || n > 100) throw new MemberAccountError('invalid_share');
  return String(Math.round(n * 100) / 100);
}

/**
 * گاردِ تسویه: بازپرداخت، کسر و بخشش نباید از بدهی بیشتر شوند — وگرنه «شرکت
 * به عضو بدهکار» می‌شد، که جایش دستمزدِ پروژه است نه این حساب. رواداریِ نیم‌سنت.
 */
export function assertWithinBalance(balance: number, amount: string): void {
  if (Number(amount) > balance + 0.005) throw new MemberAccountError('over_balance');
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
