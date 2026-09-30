import { describe, it, expect } from 'vitest';
import { dropTab, markTab, otherTabsAlive, shouldBeat, tabWindowMs } from './presence-tabs';

const W = tabWindowMs(60); // ۹۰ ثانیه

describe('چند تبِ یک کاربر', () => {
  it('بستنِ یک تب وقتی تبِ دیگری زنده است آفلاین نمی‌کند', () => {
    let reg = markTab({}, 'a', 1_000, W);
    reg = markTab(reg, 'b', 2_000, W);
    expect(otherTabsAlive(reg, 'a', 3_000, W)).toBe(true);
  });

  it('بستنِ آخرین تب آفلاین می‌کند', () => {
    const reg = dropTab(markTab({}, 'a', 1_000, W), 'a');
    expect(otherTabsAlive(reg, 'a', 2_000, W)).toBe(false);
  });

  it('تبِ مرده (بی‌نشان در بازه) زنده حساب نمی‌شود و از دفترچه می‌افتد', () => {
    let reg = markTab({}, 'old', 0, W);
    expect(otherTabsAlive(reg, 'new', W + 1, W)).toBe(false);
    reg = markTab(reg, 'new', W + 1, W);
    expect(Object.keys(reg)).toEqual(['new']);
  });
});

describe('کاهشِ ضربان‌های تکراری', () => {
  it('تبِ جلوی چشم همیشه می‌فرستد', () => {
    expect(shouldBeat(true, 1_000, 1_001, 60)).toBe(true);
  });

  it('تبِ پس‌زمینه وقتی تبی تازه فرستاده، نمی‌فرستد', () => {
    expect(shouldBeat(false, 1_000, 20_000, 60)).toBe(false);
    expect(shouldBeat(false, 1_000, 1_000 + 48_000, 60)).toBe(true);
    expect(shouldBeat(false, null, 5, 60)).toBe(true);
  });
});
