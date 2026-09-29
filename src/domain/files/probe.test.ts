import { describe, expect, it } from 'vitest';
import { isFresh, probeVerdict, PROBE_TTL_MS } from './probe';

describe('خودآزماییِ باکت', () => {
  it('محتوای نمونه با ۲۰۰ = باز', () => {
    expect(probeVerdict({ status: 200, body: 'kabarza-probe:abc' }, 'abc')).toBe('exposed');
  });

  it('⚠️ ۲۰۰ بی محتوای نمونه (صفحهٔ خطای پراکسی) باز نیست', () => {
    expect(probeVerdict({ status: 200, body: '<html>ok</html>' }, 'abc')).toBe('protected');
  });

  it('رد شدن = امن؛ خطای شبکه = نامشخص، نه امن', () => {
    expect(probeVerdict({ status: 403, body: 'AccessDenied' }, 'abc')).toBe('protected');
    expect(probeVerdict(null, 'abc')).toBe('unknown');
  });

  it('کشِ ۱۲ساعته', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    expect(isFresh(null, now)).toBe(false);
    expect(isFresh(new Date(now.getTime() - 60_000).toISOString(), now)).toBe(true);
    expect(isFresh(new Date(now.getTime() - PROBE_TTL_MS - 1).toISOString(), now)).toBe(false);
  });
});
