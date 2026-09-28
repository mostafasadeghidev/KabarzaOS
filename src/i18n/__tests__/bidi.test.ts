import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { createRequire } from 'node:module';
import { ltr } from '../bidi';

/**
 * نگهبانِ جهتِ جمله‌های عدددار.
 *
 * ⚠️ دلیلِ وجودش ۲۰ جای واقعی بود: کلاسِ `num` (direction: ltr) روی عنصری که
 * **جملهٔ فارسی** دارد، ترتیبِ کلمه‌ها را برعکس می‌کند. صفحه‌بندِ جدول‌ها
 * «۱–۲۰ از ۵۷ ردیف» را «از ۵۷ ردیف ۱–۲۰» نشان می‌داد، کارت‌های وظیفه تاریخ را
 * پیش از «ددلاین»، و فاکتور شناسهٔ مالیاتی را پیش از برچسبش. هیچ تستِ دیگری
 * این را نمی‌گرفت — DOM و متن درست بودند، فقط چیدمانِ بصری غلط بود.
 *
 * `num` فقط روی خودِ مقدار؛ مقداری که داخلِ رشتهٔ ترجمه (جای‌گذاریِ `{x}`) می‌نشیند با `ltr()`.
 */

describe('ltr()', () => {
  it('مقدار را میانِ LRI و PDI می‌گذارد', () => {
    expect(ltr('1–20')).toBe('\u20661–20\u2069');
    expect(ltr(57)).toBe('\u206657\u2069');
  });
});

const SRC = join(import.meta.dirname, '..', '..');
// ⚠️ پارسرِ babel ِ همراهِ Next؛ تایپ‌اسکریپت ۷ API ِ جاوااسکریپتی ندارد.
const { parse } = createRequire(import.meta.url)('next/dist/compiled/babel/parser') as {
  parse: (code: string, options: object) => { program: unknown };
};

interface Node { type: string; [key: string]: unknown }

function walk(node: unknown, visit: (n: Node) => void): void {
  if (!node || typeof node !== 'object' || typeof (node as Node).type !== 'string') return;
  visit(node as Node);
  for (const [key, value] of Object.entries(node as Node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
    if (Array.isArray(value)) value.forEach((c) => walk(c, visit));
    else walk(value, visit);
  }
}

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const PERSIAN = /[؀-ۿ]/;

describe('`num` هرگز دورِ جملهٔ فارسی نمی‌نشیند', () => {
  it('⚠️ عنصری با کلاسِ num متنِ فارسیِ ترجمه‌شده ندارد', () => {
    const violations: string[] = [];
    for (const file of files(SRC)) {
      const source = readFileSync(file, 'utf8');
      const ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
      walk(ast.program, (n) => {
        if (n.type !== 'JSXElement') return;
        const opening = n.openingElement as { attributes: Node[] };
        const cls = opening.attributes.find((a) => a.type === 'JSXAttribute' && (a.name as Node).name === 'className');
        if (!cls) return;
        const text = source.slice(cls.start as number, cls.end as number);
        if (!/(^|[\s'"`{])num([\s'"`}]|$)/.test(text)) return;
        let persian: string | null = null;
        walk({ type: 'Children', children: n.children }, (c) => {
          if (persian) return;
          if (c.type === 'JSXText' && PERSIAN.test(String(c.value))) persian = String(c.value).trim();
          const callee = c.callee as Node | undefined;
          if (c.type === 'CallExpression' && callee?.type === 'Identifier' && /^(t|tr)$/.test(String(callee.name))) {
            const first = (c.arguments as Node[])[0];
            if (first?.type === 'StringLiteral' && PERSIAN.test(String(first.value).replace(/\{\w+\}/g, ''))) {
              persian = String(first.value);
            }
          }
        });
        if (persian) {
          const line = (n.loc as { start: { line: number } }).start.line;
          violations.push(`${file.slice(SRC.length + 1).split(sep).join('/')}:${line} «${persian}»`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
