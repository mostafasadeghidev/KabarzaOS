import { describe, it, expect } from 'vitest';
import { buildTimelines, eventKind, lastActorOf } from '../timeline';

describe('تاریخچهٔ ردیفِ دفتر (پورتِ edit_log)', () => {
  it('ردیف‌های audit به تاریخچهٔ هر ردیف گروه می‌شوند؛ «توسط» آخرین عامل است', () => {
    const map = buildTimelines([
      { id: '7', action: 'ledger.create', at: new Date('2026-01-01T10:00:00Z'), name: 'سارا' },
      { id: 7, action: 'ledger.update', at: '2026-01-02T10:00:00Z', name: 'مالک' },
      { id: 8, action: 'ledger.transfer', at: new Date('2026-01-03T10:00:00Z'), name: null },
    ]);
    expect(map.get(7)).toEqual([
      { action: 'create', at: '2026-01-01T10:00:00.000Z', name: 'سارا' },
      { action: 'update', at: '2026-01-02T10:00:00.000Z', name: 'مالک' },
    ]);
    expect(lastActorOf(map.get(7))).toBe('مالک');
    // انتقال «ساخت» است؛ عاملِ بی‌نام «توسط» ندارد.
    expect(map.get(8)).toEqual([{ action: 'create', at: '2026-01-03T10:00:00.000Z', name: '' }]);
    expect(lastActorOf(map.get(8))).toBeNull();
    expect(lastActorOf(undefined)).toBeNull();
    expect(eventKind('ledger.update')).toBe('update');
    expect(eventKind('ledger.transfer')).toBe('create');
  });
});
