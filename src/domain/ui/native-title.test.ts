import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * ⚠️ `title` ِ خامِ مرورگر ممنوع است (۲.۱۹.۰): دیر می‌آید، قلم و رنگِ اپ را
 * نمی‌گیرد و روی لمس نیست. راهنمای شناور همیشه `Hint` (یا `label` ِ
 * `IconButton`) است تا همهٔ راهنماها یک‌دست بمانند.
 *
 * فقط عنصرهایی بررسی می‌شوند که `title` را به DOM می‌رسانند: تگ‌های ساده (به‌جز
 * `iframe` که `title` ِ دسترس‌پذیری می‌خواهد) و کامپوننت‌های زیر. کامپوننتی که
 * `title` را عنوان می‌گیرد (Panel، EmptyState، PageHeader، Thumb…) این‌جا نیست.
 */
const FORWARDING = new Set([
  'Button', 'Link', 'Badge', 'TableCell', 'TableHead', 'DropdownMenuTrigger', 'Avatar', 'AvatarGroup',
  'AvatarGroupCount', 'IconButton', 'AttachmentTrigger', 'AttachmentAction',
]);
const ALLOWED_INTRINSIC = new Set(['iframe']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith('.tsx') && !path.endsWith('.test.tsx')) out.push(path);
  }
  return out;
}

describe('title خامِ مرورگر', () => {
  it('هیچ عنصرِ DOM یا کامپوننتِ عبوردهنده‌ای title ندارد', () => {
    const root = join(process.cwd(), 'src');
    const offenders: string[] = [];
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\stitle=(\{|")/g)) {
        let j = text.lastIndexOf('<', m.index);
        while (j > 0 && !/^<[A-Za-z]/.test(text.slice(j, j + 3))) j = text.lastIndexOf('<', j - 1);
        const tag = /^<([A-Za-z0-9.]+)/.exec(text.slice(j))![1]!;
        const intrinsic = /^[a-z]/.test(tag);
        if ((intrinsic && !ALLOWED_INTRINSIC.has(tag)) || FORWARDING.has(tag)) {
          const line = text.slice(0, m.index).split('\n').length;
          offenders.push(`${relative(root, file)}:${line} <${tag}>`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
