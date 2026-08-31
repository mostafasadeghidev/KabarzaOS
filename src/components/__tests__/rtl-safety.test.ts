import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * گاردِ خودکارِ R-I18N-05.
 *
 * کامپوننت‌های shadcn پیش‌فرض LTR هستند و از `ml-` `mr-` `left-` `right-`
 * استفاده می‌کنند. در اپِ سه‌زبانهٔ راست‌به‌چپ این‌ها **برعکس** می‌شوند.
 *
 * این تست همان لحظه‌ای که کسی کامپوننتِ جدیدی بدونِ اصلاحِ RTL اضافه کند
 * قرمز می‌شود — به‌جای اینکه ماه‌ها بعد در چیدمانِ فارسی کشف شود.
 */

const SRC = join(import.meta.dirname, '..', '..');

/** کلاس‌های جهت‌دارِ ممنوع و جایگزینِ منطقی‌شان. */
const FORBIDDEN: Array<{ pattern: RegExp; use: string; physicalOk?: boolean }> = [
  { pattern: /\bml-(?!auto\b)[\w.[\]]+/g, use: 'ms-' },
  { pattern: /\bmr-(?!auto\b)[\w.[\]]+/g, use: 'me-' },
  { pattern: /\bpl-[\w.[\]]+/g, use: 'ps-' },
  { pattern: /\bpr-[\w.[\]]+/g, use: 'pe-' },
  { pattern: /\btext-left\b/g, use: 'text-start' },
  { pattern: /\btext-right\b/g, use: 'text-end' },
  { pattern: /\bborder-l-[\w.[\]]+/g, use: 'border-s-' },
  { pattern: /\bborder-r-[\w.[\]]+/g, use: 'border-e-' },
  { pattern: /\brounded-l-[\w.[\]]+/g, use: 'rounded-s-' },
  { pattern: /\brounded-r-[\w.[\]]+/g, use: 'rounded-e-' },
  // جای‌گذاریِ فیزیکی (`absolute right-4`). پیشوندِ `-` یا `=` رد می‌شود تا
  // `slide-in-from-right-2` و `data-[side=left]` — که به سمتِ فیزیکیِ بازشدنِ
  // منو گره خورده‌اند نه به چینشِ متن — بی‌دلیل قرمز نشوند.
  { pattern: /(?<![-=\w])left-[\w.[\]/]+/g, use: 'start-', physicalOk: true },
  { pattern: /(?<![-=\w])right-[\w.[\]/]+/g, use: 'end-', physicalOk: true },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('R-I18N-05 — هیچ کلاسِ جهت‌دارِ فیزیکی در UI', () => {
  const files = walk(SRC);

  it('فایل‌های UI پیدا شدند', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('⚠️ همهٔ کلاس‌ها باید منطقی باشند، نه چپ/راستِ فیزیکی', () => {
    const violations: string[] = [];

    for (const file of files) {
      const rel = file.slice(SRC.length + 1).split(sep).join('/');
      // فقط داخلِ رشته‌های className بررسی می‌شود، نه کامنت‌های فارسی.
      const source = readFileSync(file, 'utf8')
        // کامنت‌ها خالی می‌شوند ولی خطوطشان می‌ماند تا شمارهٔ خط درست بماند.
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/./g, ' '))
        .replace(/^[ \t]*\/\/.*$/gm, '');

      source.split('\n').forEach((line, i) => {
        for (const { pattern, use, physicalOk } of FORBIDDEN) {
          // جای‌گذاریِ واقعاً فیزیکی مجاز است و باید خودش را نشان دهد:
          // `data-[side=…]` یعنی سمتِ بازشدنِ پنل، `translate-x-` یعنی وسط‌چین، و
          // پراگمای `// rtl-physical` یعنی نویسنده آگاهانه فیزیکی نوشته است.
          if (physicalOk && /data-\[side=|translate-x-|rtl-physical/.test(line)) continue;
          const hits = line.match(pattern);
          if (hits) {
            violations.push(`${rel}:${i + 1} «${hits[0]}» → به‌جایش «${use}» استفاده کن`);
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });
});

describe('اعداد در متنِ راست‌به‌چپ', () => {
  it('کلاسِ .num برای اعداد تعریف شده است', () => {
    const css = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
    expect(css).toMatch(/\.num\s*\{/);
    expect(css).toMatch(/direction:\s*ltr/);
  });
});
