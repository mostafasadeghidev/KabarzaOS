import { describe, it, expect } from 'vitest';
import { isMoneyKey, redactMoney } from './group-redact';

describe('پالایهٔ پول در گروه (۲.۵۷.۰)', () => {
  it('کلیدهای مالی را می‌شناسد و بقیه را نه', () => {
    for (const k of ['price', 'agreedAmount', 'member_payout', 'unitRate', 'finance', 'payments', 'lightenSummary', 'teamMinutes'])
      expect(isMoneyKey(k)).toBe(true);
    for (const k of ['createdAt', 'title', 'deadline', 'dueDate', 'status', 'members', 'separated'])
      expect(isMoneyKey(k)).toBe(false);
  });

  it('در هر عمقی پاک می‌کند و بقیه را نگه می‌دارد', () => {
    const out = JSON.parse(redactMoney(JSON.stringify({
      project: { title: 'A', price: '900', currency: 'EUR' },
      members: [{ name: 'B', agreedAmount: '100', role: 'dev' }],
      finance: { incoming: '1' },
    })));
    expect(out).toEqual({ project: { title: 'A' }, members: [{ name: 'B', role: 'dev' }] });
  });

  it('متنِ ساده دست نمی‌خورد', () => {
    expect(redactMoney('a comment was posted')).toBe('a comment was posted');
  });
});
