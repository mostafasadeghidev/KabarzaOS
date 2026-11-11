import { describe, expect, it } from 'vitest';
import { aliasList, buildAliasMap, suggestMember, takenNames, toMailAccount } from './accounts';

/** همان شکلِ پاسخِ Stalwart ِ واقعی (x:Account/get، ۲۰۲۶-۱۱-۱۱). */
const raw = {
  id: 'c', name: 'test-smtp', domainId: 'b', emailAddress: 'test-smtp@example.com', description: 'For Test',
  aliases: {
    1: { enable: true, name: 'team', domainId: 'b', description: null },
    0: { enable: true, name: 'test-smtp', domainId: 'c', description: null },
    2: { enable: false, name: 'old', domainId: 'b', description: null },
  },
  quotas: { maxDiskQuota: 5368709120 }, usedDiskQuota: 14236517,
};
const names = new Map([['b', 'example.com'], ['c', 'box.example.com']]);

describe('حساب‌های ایمیل — منطقِ خالص', () => {
  it('map ِ aliasها به ترتیبِ کلید خوانده می‌شود', () => {
    expect(aliasList(raw.aliases).map((a) => a.name)).toEqual(['test-smtp', 'team', 'old']);
    expect(aliasList(null)).toEqual([]);
  });

  it('فقط aliasهای روشنِ دامنهٔ اصلی ویرایش‌پذیرند؛ بقیه فقط نمایش', () => {
    const a = toMailAccount(raw, 'b', names)!;
    expect(a.aliases).toEqual(['team']);
    expect(a.otherAliases).toEqual(['test-smtp@box.example.com', 'old@example.com (off)']);
    expect(a.quotaBytes).toBe(5368709120);
    expect(a.usedBytes).toBe(14236517);
  });

  it('⚠️ map ِ تازه aliasهای دامنه‌های دیگر را نگه می‌دارد و کلیدها از ۰ پشتِ هم‌اند', () => {
    const map = buildAliasMap(aliasList(raw.aliases), ['team', 'sales'], 'b');
    expect(map).toEqual({
      0: { enable: true, name: 'test-smtp', domainId: 'c', description: null },
      1: { enable: true, name: 'team', domainId: 'b', description: null },
      2: { enable: true, name: 'sales', domainId: 'b', description: null },
    });
    // خالی = هیچ aliasی در دامنهٔ اصلی، ولی دامنهٔ قدیمی دست نمی‌خورد.
    expect(Object.values(buildAliasMap(aliasList(raw.aliases), [], 'b')).map((a) => a.name)).toEqual(['test-smtp']);
  });

  it('نام‌های گرفته‌شده: نامِ حساب‌ها و aliasها، جز خودِ حساب', () => {
    const accounts = [
      { id: 'c', name: 'test-smtp', domainId: 'b', aliases: ['team'] },
      { id: 'd', name: 'mostafa', domainId: 'b', aliases: ['hi'] },
    ];
    const taken = takenNames(accounts, 'b', 'c');
    expect([...taken].sort()).toEqual(['hi', 'mostafa']);
  });

  it('پیشنهادِ عضو: ایمیل یا نامِ کوچک، فقط وقتی یکتاست', () => {
    const acc = { name: 'ali', aliases: ['ali.m'], emailAddress: 'ali@example.com' };
    expect(suggestMember(acc, 'example.com', [
      { id: 1, name: 'Ali Maleki', email: 'personal@gmail.com' },
      { id: 2, name: 'Sara', email: 'sara@x.com' },
    ])).toBe(1);
    expect(suggestMember(acc, 'example.com', [
      { id: 1, name: 'Ali A', email: 'a@x.com' },
      { id: 2, name: 'Ali B', email: 'b@x.com' },
    ])).toBeNull();
    expect(suggestMember(acc, 'example.com', [{ id: 7, name: 'هر کس', email: 'ali.m@example.com' }])).toBe(7);
  });
});
