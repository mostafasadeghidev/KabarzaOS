import { describe, it, expect } from 'vitest';
import { open, seal } from './secret-box';

describe('رمزگذاریِ کلید', () => {
  it('رفت و برگشت؛ هر بار متنِ رمزِ تازه', () => {
    const a = seal('sk-secret');
    expect(a).not.toContain('sk-secret');
    expect(seal('sk-secret')).not.toBe(a);
    expect(open(a)).toBe('sk-secret');
  });

  it('دست‌کاری‌شده یا خراب ← null', () => {
    const [v, iv, tag, body] = seal('sk-secret').split('.');
    const flipped = body!.slice(0, -2) + (body!.endsWith('A') ? 'BB' : 'AA');
    expect(open([v, iv, tag, flipped].join('.'))).toBeNull();
    expect(open('garbage')).toBeNull();
  });
});
