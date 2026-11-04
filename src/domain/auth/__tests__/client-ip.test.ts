import { describe, it, expect } from 'vitest';
import { clientIpFrom } from '../client-ip';

describe('clientIpFrom (۲.۵۷.۰)', () => {
  it('نشانیِ تهِ فهرست را می‌گیرد، نه آنچه کاربر جلویش نوشته', () => {
    expect(clientIpFrom('1.1.1.1, 9.9.9.9', 1)).toBe('9.9.9.9');
    expect(clientIpFrom('9.9.9.9', 1)).toBe('9.9.9.9');
  });
  it('دو پراکسی ← یکی مانده به آخر', () => {
    expect(clientIpFrom('spoof, 9.9.9.9, 10.0.0.2', 2)).toBe('9.9.9.9');
  });
  it('خالی ← null', () => {
    expect(clientIpFrom(null)).toBeNull();
    expect(clientIpFrom(' , ')).toBeNull();
  });
});
