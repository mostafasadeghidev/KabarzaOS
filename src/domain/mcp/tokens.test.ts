import { describe, expect, it } from 'vitest';
import {
  bearerToken, generateToken, hashToken, isScope, looksLikeToken, rateWindow, scopesFor, tokenPrefix,
} from './tokens';

describe('توکنِ شخصی', () => {
  it('شکل، یکتایی و هش', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(looksLikeToken(a)).toBe(true);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(tokenPrefix(a)).toBe(a.slice(0, 10));
  });

  it('فقط Bearer با توکنِ درست', () => {
    const t = generateToken();
    expect(bearerToken(`Bearer ${t}`)).toBe(t);
    expect(bearerToken(`bearer ${t}`)).toBe(t);
    expect(bearerToken(t)).toBeNull();
    expect(bearerToken('Bearer kbz_short')).toBeNull();
    expect(bearerToken(`Basic ${t}`)).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it('دامنه: نوشتن شاملِ خواندن', () => {
    expect(scopesFor('read')).toEqual(['read']);
    expect(scopesFor('write')).toEqual(['read', 'write']);
    expect(isScope('admin')).toBe(false);
  });

  it('پنجرهٔ محدودیتِ درخواست', () => {
    let s: { start: number; count: number } | undefined;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = rateWindow(s, 1_000, 3);
      s = r.state;
      results.push(r.allowed);
    }
    expect(results).toEqual([true, true, true, false]);
    // پنجرهٔ تازه
    expect(rateWindow(s, 61_001, 3).allowed).toBe(true);
  });
});
