import { describe, expect, it } from 'vitest';
import { parseManualAmount } from './member-money';

describe('parseManualAmount', () => {
  it('خالی یعنی از نرخِ توافقی پیروی کن', () => {
    expect(parseManualAmount('')).toEqual({ kind: 'none' });
    expect(parseManualAmount('   ')).toEqual({ kind: 'none' });
    expect(parseManualAmount(null)).toEqual({ kind: 'none' });
    expect(parseManualAmount(undefined)).toEqual({ kind: 'none' });
  });

  it('عددِ معتبر را با چهار رقمِ اعشار برمی‌گرداند', () => {
    expect(parseManualAmount('180')).toEqual({ kind: 'ok', amount: '180.0000' });
    expect(parseManualAmount('374.1954')).toEqual({ kind: 'ok', amount: '374.1954' });
    expect(parseManualAmount('007.5')).toEqual({ kind: 'ok', amount: '7.5000' });
    expect(parseManualAmount('0')).toEqual({ kind: 'ok', amount: '0.0000' });
  });

  it('ارقامِ فارسی و عربی و جداکننده را می‌فهمد', () => {
    expect(parseManualAmount('۱۲۵۰')).toEqual({ kind: 'ok', amount: '1250.0000' });
    expect(parseManualAmount('١٢٠')).toEqual({ kind: 'ok', amount: '120.0000' });
    expect(parseManualAmount('1,250.5')).toEqual({ kind: 'ok', amount: '1250.5000' });
    expect(parseManualAmount('۱٬۲۵۰٫۵')).toEqual({ kind: 'ok', amount: '1250.5000' });
  });

  it('منفی، حرف و بیش از چهار رقمِ اعشار نامعتبر است', () => {
    for (const bad of ['-5', 'abc', '12.34567', '1e3', '١٢.٣٤٥٦٧', '--', '5.']) {
      expect(parseManualAmount(bad)).toEqual({ kind: 'invalid' });
    }
  });
});
