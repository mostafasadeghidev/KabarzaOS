import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * قلابِ ری‌اکت فقط در بدنهٔ مستقیمِ یک کامپوننت یا قلابِ دیگر مجاز است.
 *
 * ⚠️ چرا تست شد و نه بازبینیِ چشمی: چهار بار همین اتفاق افتاد و هر چهار بار
 * از دید در رفت. یک اسکریپتِ اصلاحِ خودکار در ۱.۱۶.۰ چند `const tr = useT()`
 * را داخلِ کال‌بک گذاشت. نتیجه‌اش ساکت است — کامپایل می‌شود، تایپ‌چک پاس
 * می‌شود، و فقط **در لحظهٔ کلیک** پرتاب می‌کند. دکمه‌های «تأیید پیشنهاد»،
 * «ثبت پرداخت»، «حذف جلسه» و انتخابِ گیرندهٔ پیام هفته‌ها مرده بودند.
 *
 * ⚠️ دو بار هم اسکنرِ دستی جا انداختشان: بارِ اول چون با **تورفتگی** قضاوت
 * می‌کرد (و خطِ درج‌شده تورفتگیِ غلط داشت)، بارِ دوم چون دنبالِ نزدیک‌ترین
 * تابعِ **نام‌دار** می‌گشت و از کال‌بکِ بی‌نام رد می‌شد. قاعدهٔ درست:
 * **هر** مرزِ تابع، نام‌دار یا نه.
 */

const SRC = join(process.cwd(), 'src');
const HOOK = /\buse[A-Z]\w*\s*\(/y;
const FUNC =
  /(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>|(\w+)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>)\s*$/;
const ANON = /=>\s*$/;

/** کامنت‌ها و رشته‌ها را با فاصله پر می‌کند تا آکولادِ داخلشان شمرده نشود. */
function strip(src: string): string {
  const out: string[] = [];
  let state: null | 'line' | 'block' | "'" | '"' | '`' = null;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]!;
    const next = src[i + 1] ?? '';
    if (state === null) {
      if (c === '/' && next === '/') { state = 'line'; out.push('  '); i += 1; continue; }
      if (c === '/' && next === '*') { state = 'block'; out.push('  '); i += 1; continue; }
      if (c === "'" || c === '"' || c === '`') state = c;
      out.push(c);
      continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = null; out.push('\n'); } else out.push(' ');
      continue;
    }
    if (state === 'block') {
      if (c === '*' && next === '/') { state = null; out.push('  '); i += 1; continue; }
      out.push(c === '\n' ? '\n' : ' ');
      continue;
    }
    // داخلِ رشته
    if (c === '\\') { out.push('  '); i += 1; continue; }
    if (c === state) state = null;
    out.push(c === '\n' ? '\n' : ' ');
  }
  return out.join('');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function misplacedHooks(source: string): number[] {
  const src = strip(source);
  const stack: Array<string | null> = [];
  const lines: number[] = [];

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]!;
    if (c === '{') {
      const head = src.slice(Math.max(0, i - 240), i).replace(/\s+$/, '');
      const m = FUNC.exec(head);
      if (m) stack.push(m[1] ?? m[2] ?? m[3] ?? '');
      else if (ANON.test(head)) stack.push('');   // کال‌بکِ بی‌نام — مرزِ قلاب
      else stack.push(null);                      // if/for/object — مرز نیست
      continue;
    }
    if (c === '}') { stack.pop(); continue; }
    if (c !== 'u') continue;

    HOOK.lastIndex = i;
    if (!HOOK.test(src)) continue;

    const owner = [...stack].reverse().find((n) => n !== null);
    if (owner === undefined) continue;           // سطحِ ماژول — تعریف، نه فراخوانی
    const valid = owner !== '' && (/^[A-Z]/.test(owner) || owner.startsWith('use'));
    if (!valid) lines.push(src.slice(0, i).split('\n').length);
  }
  return lines;
}

describe('جایگاهِ قلاب‌ها', () => {
  it('هیچ قلابی داخلِ کال‌بک یا تابعِ غیرکامپوننت نیست', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const lines = misplacedHooks(readFileSync(file, 'utf8'));
      for (const line of lines) {
        offenders.push(`${file.slice(SRC.length + 1).replace(/\\/g, '/')}:${line}`);
      }
    }
    expect(offenders, `قلابِ بدجا: ${offenders.join(' · ')}`).toEqual([]);
  });

  /** خودِ آشکارساز باید کار کند — وگرنه تستِ سبز چیزی ثابت نمی‌کند. */
  it('⚠️ آشکارساز واقعاً می‌گیرد — همان شکلی که چهار بار از دید در رفت', () => {
    const sample = [
      'export function Widget() {',
      '  const t = useT();',
      '  const run = () =>',
      '    startTransition(async () => {',
      '      const tr = useT();',
      '      await go();',
      '    });',
      '  return null;',
      '}',
    ].join('\n');
    expect(misplacedHooks(sample)).toEqual([5]);
  });

  it('قلابِ سطحِ کامپوننت را اشتباه نمی‌گیرد', () => {
    const sample = 'export function Widget() {\n  const t = useT();\n  return null;\n}';
    expect(misplacedHooks(sample)).toEqual([]);
  });
});
