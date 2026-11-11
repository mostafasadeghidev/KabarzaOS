import { describe, expect, it } from 'vitest';
import { agoLabel } from './last-online';

const t = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v?.[k] ?? ''));

describe('«چند وقت پیش» ِ آخرین حضور', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  it('بازه‌های درشت', () => {
    expect(agoLabel('2026-11-11T11:59:30Z', t, now)).toBe('همین حالا');
    expect(agoLabel('2026-11-11T11:45:00Z', t, now)).toBe('15 دقیقه پیش');
    expect(agoLabel('2026-11-11T09:00:00Z', t, now)).toBe('3 ساعت پیش');
    expect(agoLabel('2026-11-01T12:00:00Z', t, now)).toBe('10 روز پیش');
    expect(agoLabel('2026-06-01T12:00:00Z', t, now)).toBe('5 ماه پیش');
  });
  it('زمانِ آینده (ساعتِ ناهماهنگ) «همین حالا» است، نه عددِ منفی', () => {
    expect(agoLabel('2026-11-11T12:05:00Z', t, now)).toBe('همین حالا');
  });
});
