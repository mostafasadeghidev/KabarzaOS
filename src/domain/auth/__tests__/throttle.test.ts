import { describe, it, expect } from 'vitest';
import { createFailureStore, throttleKeys, worstFailures } from '../throttle';

describe('محدودکنندهٔ تلاشِ ورود', () => {
  it('شکست‌ها در پنجره شمرده می‌شوند و بیرونِ پنجره می‌افتند؛ موفقیت پاک می‌کند', () => {
    const store = createFailureStore(1000);
    store.recordFailure('id:a', 0);
    store.recordFailure('id:a', 500);
    expect(store.recentFailures('id:a', 900)).toBe(2);
    expect(store.recentFailures('id:a', 1200)).toBe(1);
    expect(store.recentFailures('id:a', 2000)).toBe(0);
    store.recordFailure('id:a', 3000);
    store.clear('id:a');
    expect(store.recentFailures('id:a', 3000)).toBe(0);
  });

  it('کلیدِ شناسه و IP جدا شمرده می‌شوند و بدترین تصمیم می‌گیرد', () => {
    const store = createFailureStore(1000);
    const keys = throttleKeys('  Owner@Example.com ', '10.0.0.1');
    expect(keys).toEqual(['id:owner@example.com', 'ip:10.0.0.1']);
    for (let i = 0; i < 3; i++) store.recordFailure('ip:10.0.0.1', i);
    store.recordFailure('id:owner@example.com', 0);
    expect(worstFailures(store, keys, 10)).toBe(3);
    expect(throttleKeys('', null)).toEqual([]);
  });
});
