import { describe, it, expect } from 'vitest';
import {
  latinDigits, normalizeProjectCode, parseTaskRef, projectCodeOf, suggestProjectCode,
  taskRefGlobal, taskRefLocal, TASK_REF_IN_TEXT,
} from './task-ref';

describe('ارجاعِ تسک با شماره', () => {
  it('ارقامِ فارسی و عربی لاتین می‌شوند', () => {
    expect(latinDigits('#۳۲۵ و ٤٢')).toBe('#325 و 42');
  });

  it('خواندنِ «325»، «#325»، «#۳۲۵»، «alz-325»، «ALZ 325»', () => {
    expect(parseTaskRef('325')).toEqual({ kind: 'local', number: 325 });
    expect(parseTaskRef(' #325 ')).toEqual({ kind: 'local', number: 325 });
    expect(parseTaskRef('#۳۲۵')).toEqual({ kind: 'local', number: 325 });
    expect(parseTaskRef('alz-325')).toEqual({ kind: 'global', code: 'ALZ', number: 325 });
    expect(parseTaskRef('ALZ 325')).toEqual({ kind: 'global', code: 'ALZ', number: 325 });
  });

  it('متنِ عادی، صفر و عددِ خیلی بلند ارجاع نیست', () => {
    for (const s of ['هدر', '#0', '0', '12345678', 'A-1', 'ALZ-', '']) expect(parseTaskRef(s), s).toBeNull();
  });

  it('کدِ پروژه: ۲ تا ۶ حرف/رقم، با حرف شروع', () => {
    expect(normalizeProjectCode(' alz ')).toBe('ALZ');
    expect(normalizeProjectCode('web2')).toBe('WEB2');
    for (const s of ['A', '1AB', 'TOOLONG7', 'آلف', 'A-B']) expect(normalizeProjectCode(s), s).toBeNull();
  });

  it('کدِ پیش‌فرض و پیشنهادی', () => {
    expect(projectCodeOf({ id: 12, code: '' })).toBe('P12');
    expect(projectCodeOf({ id: 12, code: 'ALZ' })).toBe('ALZ');
    expect(suggestProjectCode('Alzahra website', 4)).toBe('ALZ');
    expect(suggestProjectCode('سایتِ الزهرا', 4)).toBe('P4');
    expect(taskRefLocal(325)).toBe('#325');
    expect(taskRefGlobal({ id: 4, code: 'ALZ' }, 325)).toBe('ALZ-325');
  });

  it('ارجاع‌های داخلِ متن — نه رنگ، نه لنگرِ پیوند', () => {
    const found = (text: string) => [...text.matchAll(TASK_REF_IN_TEXT)].map((m) => m[2]);
    expect(found('سارا #325 رو تموم کن، بعد ALZ-12.')).toEqual(['#325', 'ALZ-12']);
    expect(found('#12 اول خط')).toEqual(['#12']);
    expect(found('رنگ #fff و https://x.com/a#3 و abc#4')).toEqual([]);
  });
});

describe('تکه‌کردنِ متن برای پیوندِ ارجاع', () => {
  it('متن و ارجاع‌ها به ترتیب، بی‌آنکه حرفی گم شود', async () => {
    const { splitTaskRefs } = await import('./task-ref');
    const text = 'سارا #325 رو تموم کن، بعد ALZ-12.';
    const parts = splitTaskRefs(text);
    expect(parts.map((p) => p.text).join('')).toBe(text);
    expect(parts.filter((p) => p.kind === 'ref')).toEqual([
      { kind: 'ref', text: '#325', code: null, number: 325 },
      { kind: 'ref', text: 'ALZ-12', code: 'ALZ', number: 12 },
    ]);
    expect(splitTaskRefs('بی ارجاع')).toEqual([{ kind: 'text', text: 'بی ارجاع' }]);
  });
});
