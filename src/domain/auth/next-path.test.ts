import { describe, expect, it } from 'vitest';
import { safeNextPath } from './next-path';

describe('safeNextPath', () => {
  it('مسیرِ داخلی می‌ماند', () => {
    expect(safeNextPath('/oauth/authorize?client_id=x&state=y')).toBe('/oauth/authorize?client_id=x&state=y');
  });
  it('⚠️ هر نشانیِ بیرونی ← خانه', () => {
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '', null, '/a\nb']) {
      expect(safeNextPath(bad)).toBe('/');
    }
  });
});
