import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../presence';

describe('normalizeConfig — آفلاین هرگز از بی‌کاری کوتاه‌تر نیست', () => {
  it('offline کوتاه‌تر از idle بالا کشیده می‌شود', () => {
    // ⚠️ همان حالتِ ناسازگار: idle=300 با offline=90 — تبِ پس‌زمینه پیش از «بی‌کار» شدن «آفلاین» می‌شد.
    const c = normalizeConfig({ ping: 60, idleAfter: 300, offlineAfter: 90 });
    expect(c.idleAfter).toBe(300);
    expect(c.offlineAfter).toBeGreaterThanOrEqual(c.idleAfter);
  });

  it('ترتیبِ درست دست نمی‌خورد', () => {
    const c = normalizeConfig({ ping: 60, idleAfter: 120, offlineAfter: 300 });
    expect(c).toEqual({ ping: 60, idleAfter: 120, offlineAfter: 300 });
  });

  it('مقدارِ خارج از فهرست به پیش‌فرض برمی‌گردد و باز هم مرتب می‌ماند', () => {
    const c = normalizeConfig({ ping: 7, idleAfter: 999, offlineAfter: 1 });
    expect(c.offlineAfter).toBeGreaterThanOrEqual(c.idleAfter);
  });
});
