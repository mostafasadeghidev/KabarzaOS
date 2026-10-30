import { describe, expect, it } from 'vitest';
import type { Actor } from '@/domain/access/permissions';
import {
  canDeleteEntry, canEditEntry, canSuggestEdit, canUseLibrary, changedParts, cleanEntry, combineProjectCode,
  defaultPlacement, freshness, lineDiff, lines, normalizeContent, normalizeTopics, parseAllowed, pasteReady, safeUrl,
  type EntryInput, type StepInput, type SuggestedContent,
} from './model';

const actor = (roles: Actor['roles'], id = 7, permissions: Actor['permissions'] = []): Actor => ({
  id, roles, permissions, privateAccess: false,
});

const input = (patch: Partial<EntryInput> = {}): EntryInput => ({
  kind: 'code', title: 'Masonry grid', summary: '', platform: 'webflow', status: 'ready', topics: [],
  body: '', steps: [], warnings: '', dependencies: '', demoUrl: '', clientVisible: false, originProjectId: null,
  blocks: [{ label: '', language: 'js', placement: 'site_body_end', placementNote: '', code: 'Macy({})' }],
  options: [], related: [],
  ...patch,
});

const step = (patch: Partial<StepInput> = {}): StepInput => ({
  title: '', body: '', blockIndexes: [], optionNames: [], mediaIds: [], ...patch,
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
    expect(r.ok && r.entry.options).toEqual([{
      name: 'data-flow-price', kind: 'attribute', role: 'setting', description: 'قیمتِ پایه', value: '',
      defaultValue: '130', element: '', target: '', allowedValues: [], important: '', example: '',
    }]);
  });

  it('کارتِ گزینه: جایگاه، مقدار، مقدارهای مجاز (بی‌تکرار) و نامِ تکراری کنار می‌رود', () => {
    const r = cleanEntry(input({
      options: [
        {
          name: ' fs-rangeslider-update ', kind: 'attribute', role: 'setting', description: '', defaultValue: 'move',
          allowedValues: [{ value: 'move', description: 'هر حرکت' }, { value: 'move', description: 'دوباره' }, { value: ' ', description: '' }],
          element: 'Div Block', target: 'wrapper', important: 'position: relative', example: 'x = "move"',
        },
        { name: 'fs-rangeslider-update', kind: 'attribute', description: 'تکراری', defaultValue: '' },
        { name: 'fs-rangeslider-element', kind: 'attribute', role: 'nonsense', value: 'wrapper', description: '', defaultValue: '' },
        // ⚠️ همان نام با مقدارِ دیگر گزینهٔ دیگری است.
        { name: 'fs-rangeslider-element', kind: 'attribute', role: 'required', value: 'track', description: '', defaultValue: '' },
        { name: 'fs-rangeslider-element', kind: 'attribute', value: 'track', description: 'تکراری', defaultValue: '' },
      ],
      steps: [step({ title: 's', optionNames: ['fs-rangeslider-element=track', 'fs-rangeslider-element'] })],
    }));
    expect(r.ok && r.entry.options.map((o) => [o.name, o.role, o.value])).toEqual([
      ['fs-rangeslider-update', 'setting', ''],
      ['fs-rangeslider-element', 'setting', 'wrapper'],
      ['fs-rangeslider-element', 'required', 'track'],
    ]);
    expect(r.ok && r.entry.steps[0]!.optionNames).toEqual(['fs-rangeslider-element=track']);
    expect(r.ok && r.entry.options[0]!.allowedValues).toEqual([{ value: 'move', description: 'هر حرکت' }]);
  });

  it('مقدارهای مجاز از «مقدار — توضیح» در هر خط', () => {
    expect(parseAllowed('move — هر حرکت\nrelease - پس از رها کردن\n\ntrue')).toEqual([
      { value: 'move', description: 'هر حرکت' },
      { value: 'release', description: 'پس از رها کردن' },
      { value: 'true', description: '' },
    ]);
  });

  it('هشدارها و پیش‌نیازها هر خط یکی، بی‌خطِ خالی و بی‌علامتِ دستی', () => {
    const r = cleanEntry(input({ warnings: '* هشدار\n\n- دوم', dependencies: '1. GSAP' }));
    expect(r.ok && r.entry.warnings).toBe('هشدار\nدوم');
    expect(r.ok && r.entry.dependencies).toBe('GSAP');
  });

  it('⚠️ گامِ خالی کنار می‌رود — مگر تصویرِ تازه‌ای همراهش آپلود شود', () => {
    const r = cleanEntry(input({ steps: [step(), step({ title: 'اول' }), step({ key: '7', pendingMedia: 2 })] }));
    expect(r.ok && r.entry.steps.map((s) => [s.title, s.key])).toEqual([['اول', ''], ['', '7']]);
  });

  it('⚠️ ارجاعِ گام به تکه‌کد پس از حذفِ تکهٔ خالی به جایگاهِ تازه می‌رود؛ گزینهٔ ناموجود کنار می‌رود', () => {
    const blank = { label: '', language: 'js', placement: 'embed', placementNote: '', code: '  ' };
    const real = { label: 'b', language: 'css', placement: 'site_head', placementNote: '', code: 'a{}' };
    const r = cleanEntry(input({
      blocks: [blank, real],
      options: [{ name: 'data-x', kind: 'attribute', description: '', defaultValue: '' }],
      steps: [step({ title: 's', blockIndexes: [0, 1, 1, 9], optionNames: ['data-x', 'nope'], mediaIds: [5, 5, -1] })],
    }));
    expect(r.ok && r.entry.steps[0]).toMatchObject({ blockIndexes: [0], optionNames: ['data-x'], mediaIds: [5] });
  });

  it('دسته و نشانی‌های تازه: دستهٔ ناشناخته خالی، ویدیو و Cloneable فقط http(s)', () => {
    const r = cleanEntry(input({ category: 'slider', videoUrl: 'https://loom.com/share/x', cloneableUrl: 'javascript:1' }));
    expect(r.ok && [r.entry.category, r.entry.videoUrl, r.entry.cloneableUrl]).toEqual(['slider', 'https://loom.com/share/x', '']);
    const bad = cleanEntry(input({ category: 'weird' }));
    expect(bad.ok && bad.entry.category).toBe('');
  });

  it('خلاصه یک خط است و نشانیِ نمونه فقط http(s)', () => {
    const r = cleanEntry(input({ summary: 'خط ۱\n خط ۲', demoUrl: 'javascript:alert(1)' }));
    expect(r.ok && r.entry.summary).toBe('خط ۱ خط ۲');
    expect(r.ok && r.entry.demoUrl).toBe('');
  });

  it('مرتبط‌ها یکتا و مثبت، با «چطور با هم»؛ پیش‌نیازها هم', () => {
    const r = cleanEntry(input({
      related: [{ id: 3, note: ' با هم\nکار می‌کنند ' }, { id: 3, note: 'x' }, { id: -1, note: '' }, { id: 4.5, note: '' }, { id: 9, note: '' }],
      requiresIds: [2, 2, 0, 7],
    }));
    expect(r.ok && r.entry.related).toEqual([{ id: 3, note: 'با هم کار می‌کنند' }, { id: 9, note: '' }]);
    expect(r.ok && r.entry.requiresIds).toEqual([2, 7]);
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

describe('پیشنهادِ ویرایش (۲.۴۶.۰)', () => {
  it('⚠️ فقط کسی که کتابخانه را دارد و نمی‌تواند مستقیم ویرایش کند', () => {
    expect(canSuggestEdit(actor(['member'], 8), { authorId: 7 })).toBe(true);
    expect(canSuggestEdit(actor(['member'], 7), { authorId: 7 })).toBe(false);
    expect(canSuggestEdit(actor(['owner'], 1), { authorId: 7 })).toBe(false);
    expect(canSuggestEdit(actor(['client'], 8), { authorId: 7 })).toBe(false);
    expect(canSuggestEdit(actor(['finance'], 8), { authorId: 7 })).toBe(false);
  });

  const base: SuggestedContent = {
    title: 'Masonry', summary: '', topics: ['CMS'], body: '', warnings: '', dependencies: '', instances: '', demoUrl: '',
    videoUrl: '', cloneableUrl: '',
    steps: [{ title: 'a', body: '', blockIndexes: [0], optionNames: [], mediaIds: [] }],
    blocks: [{ label: 'init', language: 'js', placement: 'site_body_end', placementNote: '', code: 'x()' }],
    options: [],
  };

  it('بخش‌های عوض‌شده — و خالی وقتی چیزی عوض نشده', () => {
    expect(changedParts(base, { ...base })).toEqual([]);
    expect(changedParts(base, { ...base, title: 'Grid', topics: ['CMS', 'grid'] })).toEqual(['title', 'topics']);
    expect(changedParts(base, { ...base, blocks: [{ ...base.blocks[0]!, code: 'y()' }] })).toEqual(['blocks']);
    expect(changedParts(base, { ...base, steps: [{ ...base.steps[0]!, blockIndexes: [] }], videoUrl: 'https://x.io' }))
      .toEqual(['videoUrl', 'steps']);
  });

  it('⚠️ پیشنهاد یا نسخهٔ پیش از ۲.۴۷.۰ (گام‌ها متن، گزینه بی‌فیلدِ تازه) خوانده می‌شود', () => {
    const legacy = normalizeContent({
      title: 'T', steps: '1. اول\nدوم', options: [{ name: 'data-x', kind: 'attribute', description: 'd', defaultValue: '1' }],
      blocks: [{ label: '', language: 'cobol', placement: 'nowhere', placementNote: '', code: 'x' }],
    });
    expect(legacy.steps.map((s) => s.title)).toEqual(['اول', 'دوم']);
    expect(legacy.options[0]).toMatchObject({ name: 'data-x', role: 'setting', value: '', allowedValues: [] });
    expect(legacy.blocks[0]).toMatchObject({ language: 'text', placement: 'other' });
    expect(legacy.videoUrl).toBe('');
  });

  it('تفاوتِ خط‌به‌خط: افزوده، حذف‌شده و بی‌تغییر', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toEqual([
      { op: 'same', text: 'a' }, { op: 'del', text: 'b' }, { op: 'add', text: 'B' }, { op: 'same', text: 'c' },
    ]);
    expect(lineDiff('', 'x')).toEqual([{ op: 'add', text: 'x' }]);
    expect(lineDiff('x', '')).toEqual([{ op: 'del', text: 'x' }]);
    expect(lineDiff('a\nb', 'a\nb').every((l) => l.op === 'same')).toBe(true);
  });

  it('⚠️ متنِ خیلی بلند: بی جدولِ سنگین، ولی همچنان درست', () => {
    const before = `h\n${Array.from({ length: 50 }, (_, i) => `old${i}`).join('\n')}\nt`;
    const after = `h\n${Array.from({ length: 50 }, (_, i) => `new${i}`).join('\n')}\nt`;
    const out = lineDiff(before, after, 100);
    expect(out[0]).toEqual({ op: 'same', text: 'h' });
    expect(out.at(-1)).toEqual({ op: 'same', text: 't' });
    expect(out.filter((l) => l.op === 'del')).toHaveLength(50);
    expect(out.filter((l) => l.op === 'add')).toHaveLength(50);
  });
});

describe('کتابخانهٔ کد — ۲.۴۷.۰', () => {
  it('«تازه» برای موردِ تازه، «به‌روز شد» برای ویرایشِ بعدی؛ اصلاحِ چنددقیقه‌ای نه', () => {
    const now = new Date('2026-10-31T12:00:00Z');
    const day = 86_400_000;
    const at = (d: number) => new Date(now.getTime() - d * day);
    expect(freshness(at(2), at(2), now)).toBe('new');
    expect(freshness(at(40), at(3), now)).toBe('updated');
    expect(freshness(at(40), new Date(at(40).getTime() + 600_000), now)).toBe(null);
    expect(freshness(at(40), at(20), now)).toBe(null);
  });

  it('⚠️ کدِ خام برای چسباندن در Custom code برچسب می‌گیرد؛ کدِ برچسب‌دار دست نمی‌خورد', () => {
    expect(pasteReady({ language: 'css', code: '.a{}' })).toBe('<style>\n.a{}\n</style>');
    expect(pasteReady({ language: 'js', code: 'go()' })).toBe('<script>\ngo()\n</script>');
    expect(pasteReady({ language: 'js', code: '<script src="x.js"></script>' })).toBe('<script src="x.js"></script>');
    expect(pasteReady({ language: 'css', code: '<link rel="stylesheet" href="a.css">' })).toBe('<link rel="stylesheet" href="a.css">');
    expect(pasteReady({ language: 'html', code: '<div></div>' })).toBe('<div></div>');
  });

  it('⚠️ کدِ یک‌جای پروژه: پیش‌نیاز اول، تکهٔ تکراری یک بار، Embed بیرون، دورِ پیش‌نیازها بی‌خطر', () => {
    const groups = combineProjectCode([
      {
        entryId: 2, title: 'Slider', requires: [1],
        blocks: [
          { label: 'init', language: 'js', placement: 'site_body_end', code: 'slider()' },
          { label: 'gsap', language: 'html', placement: 'site_head', code: '<script src="gsap.js"></script>' },
          { label: 'markup', language: 'html', placement: 'embed', code: '<div></div>' },
        ],
      },
      { entryId: 1, title: 'GSAP', requires: [2], blocks: [{ label: '', language: 'html', placement: 'site_head', code: '<script src="gsap.js"></script>' }] },
      { entryId: 3, title: 'Css', requires: [], blocks: [{ label: '', language: 'css', placement: 'site_head', code: '.x{}' }] },
    ]);
    expect(groups.map((g) => g.placement)).toEqual(['site_head', 'site_body_end']);
    const head = groups[0]!;
    expect(head.parts.map((p) => p.entryId)).toEqual([1, 3]);
    expect(head.code).toContain('<!-- GSAP -->\n<script src="gsap.js"></script>');
    expect(head.code).toContain('<style>\n.x{}\n</style>');
    expect(groups[1]!.parts[0]).toMatchObject({ entryId: 2, code: '<script>\nslider()\n</script>' });
  });
});
