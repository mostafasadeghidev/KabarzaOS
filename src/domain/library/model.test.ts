import { describe, expect, it } from 'vitest';
import type { Actor } from '@/domain/access/permissions';
import {
  canDeleteEntry, canEditEntry, canUseLibrary, cleanEntry, defaultPlacement, lines, normalizeTopics, safeUrl,
  type EntryInput,
} from './model';

const actor = (roles: Actor['roles'], id = 7, permissions: Actor['permissions'] = []): Actor => ({
  id, roles, permissions, privateAccess: false,
});

const input = (patch: Partial<EntryInput> = {}): EntryInput => ({
  kind: 'code', title: 'Masonry grid', summary: '', platform: 'webflow', status: 'ready', topics: [],
  body: '', steps: '', warnings: '', dependencies: '', demoUrl: '', clientVisible: false, originProjectId: null,
  blocks: [{ label: '', language: 'js', placement: 'site_body_end', placementNote: '', code: 'Macy({})' }],
  options: [], relatedIds: [],
  ...patch,
});

describe('کتابخانهٔ کد — پاک‌سازیِ ورودی', () => {
  it('عنوانِ خالی رد می‌شود', () => {
    expect(cleanEntry(input({ title: '   ' }))).toEqual({ ok: false, error: 'title_required' });
  });

  it('«کد» بی‌تکه‌کد رد می‌شود؛ تکهٔ فقط‌فاصله هم تکه حساب نمی‌شود', () => {
    expect(cleanEntry(input({ blocks: [] }))).toEqual({ ok: false, error: 'code_required' });
    const blank = { label: '', language: 'js', placement: 'embed', placementNote: '', code: '  \n ' };
    expect(cleanEntry(input({ blocks: [blank] }))).toEqual({ ok: false, error: 'code_required' });
  });

  it('راهنما و یادداشت بی‌کد هم پذیرفته می‌شوند', () => {
    expect(cleanEntry(input({ kind: 'guide', blocks: [] })).ok).toBe(true);
    expect(cleanEntry(input({ kind: 'note', blocks: [] })).ok).toBe(true);
  });

  it('⚠️ «کارفرما ببیند» فقط برای راهنمای کارفرما — کد هرگز به کارفرما نمی‌رسد', () => {
    const code = cleanEntry(input({ kind: 'code', clientVisible: true }));
    const guide = cleanEntry(input({ kind: 'guide', clientVisible: true, blocks: [] }));
    expect(code.ok && code.entry.clientVisible).toBe(false);
    expect(guide.ok && guide.entry.clientVisible).toBe(true);
  });

  it('تورفتگیِ اولِ کد می‌ماند و فقط فاصلهٔ ته حذف می‌شود', () => {
    const r = cleanEntry(input({ blocks: [{ label: '', language: 'css', placement: '', placementNote: '', code: '  .a { }\n\n' }] }));
    expect(r.ok && r.entry.blocks[0]!.code).toBe('  .a { }');
  });

  it('⚠️ کدِ بلندتر از سقف بریده نمی‌شود، رد می‌شود', () => {
    const huge = 'x'.repeat(100_001);
    const r = cleanEntry(input({ blocks: [{ label: '', language: 'js', placement: '', placementNote: '', code: huge }] }));
    expect(r).toEqual({ ok: false, error: 'too_long' });
  });

  it('زبان و جای نصبِ نامعتبر به پیش‌فرضِ همان زبان برمی‌گردد', () => {
    const r = cleanEntry(input({ blocks: [{ label: '', language: 'css', placement: 'nowhere', placementNote: '', code: 'a{}' }] }));
    expect(r.ok && r.entry.blocks[0]).toMatchObject({ language: 'css', placement: 'site_head' });
    const bad = cleanEntry(input({ blocks: [{ label: '', language: 'cobol', placement: 'embed', placementNote: '', code: 'x' }] }));
    expect(bad.ok && bad.entry.blocks[0]!.language).toBe('text');
  });

  it('گزینهٔ بی‌نام کنار می‌رود و نوعِ نامعتبر Attribute می‌شود', () => {
    const r = cleanEntry(input({
      options: [
        { name: '', kind: 'attribute', description: 'x', defaultValue: '' },
        { name: 'data-flow-price', kind: 'weird', description: 'قیمتِ پایه', defaultValue: '130' },
      ],
    }));
    expect(r.ok && r.entry.options).toEqual([
      { name: 'data-flow-price', kind: 'attribute', description: 'قیمتِ پایه', defaultValue: '130' },
    ]);
  });

  it('گام‌ها، هشدارها و پیش‌نیازها هر خط یکی، بی‌خطِ خالی و بی‌علامتِ دستی', () => {
    const r = cleanEntry(input({ steps: '1. اول\n\n- دوم\n  ۳) سوم ', warnings: '* هشدار' }));
    expect(r.ok && r.entry.steps).toBe('اول\nدوم\n۳) سوم');
    expect(r.ok && r.entry.warnings).toBe('هشدار');
  });

  it('خلاصه یک خط است و نشانیِ نمونه فقط http(s)', () => {
    const r = cleanEntry(input({ summary: 'خط ۱\n خط ۲', demoUrl: 'javascript:alert(1)' }));
    expect(r.ok && r.entry.summary).toBe('خط ۱ خط ۲');
    expect(r.ok && r.entry.demoUrl).toBe('');
  });

  it('شناسه‌های مرتبط یکتا و مثبت', () => {
    const r = cleanEntry(input({ relatedIds: [3, 3, -1, 0, 4.5, 9] }));
    expect(r.ok && r.entry.relatedIds).toEqual([3, 9]);
  });
});

describe('کتابخانهٔ کد — کمکی‌ها', () => {
  it('lines', () => {
    expect(lines(' a \r\n\r\n2. b\n• c')).toEqual(['a', 'b', 'c']);
  });

  it('برچسب‌ها بی‌تکرار (بی‌حساسیت به بزرگی) و حداکثر ده‌تا', () => {
    expect(normalizeTopics(['CMS', 'cms', '  فرم  ', ''])).toEqual(['CMS', 'فرم']);
    expect(normalizeTopics(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
  });

  it('safeUrl', () => {
    expect(safeUrl(' https://a.io/x ')).toBe('https://a.io/x');
    expect(safeUrl('ftp://a.io')).toBe('');
  });

  it('جای نصبِ پیش‌فرضِ هر زبان', () => {
    expect(defaultPlacement('css')).toBe('site_head');
    expect(defaultPlacement('js')).toBe('site_body_end');
    expect(defaultPlacement('html')).toBe('embed');
    expect(defaultPlacement('json')).toBe('other');
  });
});

describe('کتابخانهٔ کد — دسترسی', () => {
  it('⚠️ تیم بله؛ مالی و کارفرما نه', () => {
    expect(canUseLibrary(actor(['owner']))).toBe(true);
    expect(canUseLibrary(actor(['admin']))).toBe(true);
    expect(canUseLibrary(actor(['member']))).toBe(true);
    expect(canUseLibrary(actor(['finance']))).toBe(false);
    expect(canUseLibrary(actor(['client']))).toBe(false);
  });

  it('ویرایش: نویسنده یا مدیرِ سراسریِ پروژه‌ها — نه عضوِ دیگر', () => {
    expect(canEditEntry(actor(['member'], 7), { authorId: 7 })).toBe(true);
    expect(canEditEntry(actor(['member'], 8), { authorId: 7 })).toBe(false);
    expect(canEditEntry(actor(['owner'], 1), { authorId: 7 })).toBe(true);
    expect(canEditEntry(actor(['admin'], 2, ['projects.manage']), { authorId: 7 })).toBe(true);
    expect(canEditEntry(actor(['admin'], 2, ['projects.view']), { authorId: 7 })).toBe(false);
    // ⚠️ کارفرمایی که روزی نویسنده ثبت شده باشد هم ویرایش نمی‌کند.
    expect(canEditEntry(actor(['client'], 7), { authorId: 7 })).toBe(false);
  });

  it('⚠️ حذفِ کامل فقط وقتی روی هیچ پروژه‌ای نصب نیست', () => {
    expect(canDeleteEntry(actor(['member'], 7), { authorId: 7 }, 0)).toBe(true);
    expect(canDeleteEntry(actor(['member'], 7), { authorId: 7 }, 1)).toBe(false);
    expect(canDeleteEntry(actor(['owner'], 1), { authorId: 7 }, 3)).toBe(false);
  });
});
