import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TOURS } from './index';
import type { TourCtx } from './types';

/**
 * نگهبانِ راهنماها (۳.۱۹.۰): شناسه‌ها یکتا، متن‌ها فارسی و غیرخالی، و هر `target` واقعاً جایی در کد
 * با `data-tour` گذاشته شده باشد — وگرنه قدم بی‌صدا «این بخش اینجا نیست» نشان می‌داد.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.tsx?$/.test(e) && !e.includes('.test.')) out.push(f);
  }
  return out;
}
const src = walk('src').map((f) => readFileSync(f, 'utf8')).join('\n');
/** برچسب‌های ثابت: data-tour="x" یا data-tour={'x'}؛ و پیشوندهای پویا: data-tour={`nav-${…}`} ← «nav-». */
const fixed = new Set([...src.matchAll(/data-tour=(?:"([^"]+)"|\{'([^']+)'\}|\{"([^"]+)"\})/g)].map((m) => m[1] ?? m[2] ?? m[3]!));
const prefixes = [...src.matchAll(/data-tour=\{`([^`$]*)\$\{/g)].map((m) => m[1]!);
// نوارِ تبِ مشترک: <OverflowTabs tour="project-tab" …> ← هر تب «project-tab-<value>».
prefixes.push(...[...src.matchAll(/<OverflowTabs[^>]*?\stour="([^"]+)"/g)].map((m) => `${m[1]!}-`));
const exists = (t: string) => fixed.has(t) || prefixes.some((p) => p && t.startsWith(p));

const FA = /[؀-ۿ]/;
const ALL: TourCtx = { roles: ['owner'], perms: [], isOwner: true, managesTeam: true, isPm: true, isMember: true, isClientOnly: false, usesTimesheet: true, onboarding: true, corpMail: true, cloud: true };

/**
 * ⚠️ ترجمه از خودِ دادهٔ راهنما، نه از جستجوی متن: متن‌های خوش‌آمد در جدولی با کلیدهای `hello` / `menu`
 * بودند و استخراج‌گر (که فقط `title:` / `body:` را می‌شناسد) ندیدشان — کارمندِ انگلیسی‌زبان قدمِ دوم را فارسی دید.
 */
describe('هر متنِ راهنما در همهٔ زبان‌ها ترجمه دارد', () => {
  const texts = new Set<string>();
  for (const t of TOURS) {
    texts.add(t.title); texts.add(t.description);
    for (const s of t.steps) { texts.add(s.title); texts.add(s.body); }
  }
  for (const locale of ['en', 'ar', 'ckb', 'de', 'es', 'fr', 'pt', 'tr']) {
    it(locale, () => {
      const msgs = JSON.parse(readFileSync(join('src/i18n/messages', `${locale}.json`), 'utf8')) as Record<string, string>;
      expect([...texts].filter((k) => !msgs[k])).toEqual([]);
    });
  }
});

describe('راهنماها', () => {
  it('شناسهٔ راهنماها یکتاست', () => {
    const ids = TOURS.map((t) => t.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  for (const tour of TOURS) {
    describe(tour.id, () => {
      it('شناسه و متن‌ها درست‌اند', () => {
        expect(tour.id).toMatch(/^[a-z0-9-]{1,64}$/);
        expect(FA.test(tour.title) && FA.test(tour.description)).toBe(true);
        expect(tour.steps.length).toBeGreaterThan(0);
        const sids = tour.steps.map((s) => s.id);
        expect(sids.filter((id, i) => sids.indexOf(id) !== i)).toEqual([]);
        for (const s of tour.steps) {
          expect(s.id, s.id).toMatch(/^[a-z0-9-]{1,64}$/);
          expect(FA.test(s.title) && FA.test(s.body), `${tour.id}/${s.id}: متنِ فارسی`).toBe(true);
          if (s.kind === 'click') expect(s.target, `${tour.id}/${s.id}: قدمِ کلیک بی‌عنصر`).toBeTruthy();
        }
      });

      it('هر target در کد data-tour دارد', () => {
        const missing = tour.steps.filter((s) => s.target && !exists(s.target)).map((s) => `${s.id} → ${s.target}`);
        expect(missing).toEqual([]);
      });

      it('next به راهنمای موجود اشاره می‌کند', () => {
        const ids = new Set(TOURS.map((t) => t.id));
        expect((tour.next ?? []).filter((n) => !ids.has(n))).toEqual([]);
      });

      it('audience و when بی‌خطا اجرا می‌شوند', () => {
        expect(() => { tour.audience(ALL); for (const s of tour.steps) s.when?.(ALL); }).not.toThrow();
      });
    });
  }
});
