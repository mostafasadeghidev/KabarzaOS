import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * نگهبانِ R-ARCH-07 — دستورِ بالای فایل جزوِ کد است.
 *
 * ⚠️ چرا این تست وجود دارد: یک اسکریپتِ افزودنِ ایمپورت، همه‌چیزِ پیش از
 * اولین `import` را بُرید و `'use server'` را با خود برد. **تایپ‌چک سبز
 * ماند، ۱۰۵۱ تست سبز ماند**، و فقط `next build` شکست — با پیامی که به
 * `child_process` اشاره می‌کرد، نه به فایلِ خراب. پیدا کردنش وقت برد.
 *
 * حالا هر ویرایشِ دسته‌جمعی که دستور را ببرد، همین‌جا می‌شکند.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

/** خطِ معنادارِ اول — کامنت و خطِ خالی رد می‌شوند. */
function firstMeaningfulLine(source: string): string {
  const lines = source.split('\n');
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    if (line.startsWith('//')) continue;
    return line;
  }
  return '';
}

/**
 * ⚠️ هر دو نوع کوتیشن پذیرفته می‌شود: کدِ رسمیِ shadcn دابل‌کوت می‌نویسد و
 * کدِ خودمان تک‌کوتیشن. تستی که فقط یکی را بپذیرد، فایلِ سالم را خراب
 * گزارش می‌کند — و بار اول همین شد.
 */
function isDirective(line: string, directive: string): boolean {
  return line === `'${directive}';` || line === `"${directive}";`
    || line === `'${directive}'` || line === `"${directive}"`;
}

const APP = join(process.cwd(), 'src', 'app');
const SRC = join(process.cwd(), 'src');

describe('دستورهای بالای فایل', () => {
  it("⚠️ هر فایلِ اکشن «use server» دارد", () => {
    const missing = walk(APP)
      .filter((f) => /(^|[\\/])(actions|[\w-]+-actions)\.ts$/.test(f))
      .filter((f) => !isDirective(firstMeaningfulLine(readFileSync(f, 'utf8')), 'use server'));

    expect(missing, `بدونِ 'use server': ${missing.join(' · ')}`).toEqual([]);
  });

  it('اسکنر واقعاً فایلِ اکشن پیدا می‌کند', () => {
    // ⚠️ بدونِ این، تستِ بالا با صفر فایل هم سبز می‌ماند.
    const found = walk(APP).filter((f) => /(^|[\\/])(actions|[\w-]+-actions)\.ts$/.test(f));
    expect(found.length).toBeGreaterThan(5);
  });

  it("⚠️ کامپوننتی که هوک دارد «use client» دارد", () => {
    const HOOKS = /\b(useState|useEffect|useActionState|useTransition|useRef|useMemo|useRouter|useSearchParams|useFormStatus)\s*\(/;

    const missing = walk(SRC)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => {
        const source = readFileSync(f, 'utf8');
        if (!HOOKS.test(source)) return false;
        return !isDirective(firstMeaningfulLine(source), 'use client');
      });

    expect(missing, `بدونِ 'use client': ${missing.join(' · ')}`).toEqual([]);
  });

  it("⚠️ ماژولِ فقط-سرور «server-only» را نگه می‌دارد", () => {
    /**
     * ⚠️ فایلی که **وارد** می‌کند، نه فایلی که نامش را در متن دارد — وگرنه
     * خودِ همین تست هم در دام می‌افتاد.
     */
    const guarded = walk(SRC).filter(
      (f) => !f.endsWith('.test.ts') && /^import ['"]server-only['"]/m.test(readFileSync(f, 'utf8')),
    );
    const broken = guarded.filter(
      (f) => !firstMeaningfulLine(readFileSync(f, 'utf8')).includes('server-only'),
    );
    expect(broken, `server-only جابه‌جا شده: ${broken.join(' · ')}`).toEqual([]);
  });
});
