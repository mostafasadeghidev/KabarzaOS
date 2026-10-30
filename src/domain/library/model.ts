import type { Actor } from '@/domain/access/permissions';
import { canManageSection } from '@/domain/access/permissions';
import {
  LIBRARY_KINDS, LIBRARY_LANGUAGES, LIBRARY_OPTION_KINDS, LIBRARY_PLACEMENTS, LIBRARY_PLATFORMS, LIBRARY_STATUSES,
  type LibraryKind, type LibraryLanguage, type LibraryOptionKind, type LibraryPlacement, type LibraryPlatform,
  type LibraryStatus, type LibrarySuggestionStatus,
} from './kinds';

export {
  LIBRARY_KINDS, LIBRARY_LANGUAGES, LIBRARY_OPTION_KINDS, LIBRARY_PLACEMENTS, LIBRARY_PLATFORMS, LIBRARY_STATUSES,
};
export type {
  LibraryKind, LibraryLanguage, LibraryOptionKind, LibraryPlacement, LibraryPlatform, LibraryStatus,
  LibrarySuggestionStatus,
};

/**
 * کتابخانهٔ کد و راهنما (۲.۳۷.۰) — قواعدِ خالص: برچسب‌ها، پاک‌سازیِ ورودی و دسترسی.
 *
 * ⚠️ برچسب‌ها متنِ مبدأ‌اند؛ UI با `t()` ترجمه‌شان می‌کند.
 */

export const KIND_LABELS: Record<LibraryKind, string> = {
  code: 'کد',
  guide: 'راهنمای کارفرما',
  note: 'آموزش و یادداشت',
};

/** یک خط زیرِ هر نوع، در فرم — تا نویسنده بداند کدام را انتخاب کند. */
export const KIND_HINTS: Record<LibraryKind, string> = {
  code: 'کدِ سفارشی‌ای که در سایت نصب می‌شود — با جای نصب و تنظیمات.',
  guide: 'راهنمای قدم‌به‌قدم برای کارفرما، مثلاً «قیمت‌ها را از کجا عوض کنم».',
  note: 'دانشِ تیم: روشِ کار، ترفند، آموزش یا چک‌لیست.',
};

export const PLATFORM_LABELS: Record<LibraryPlatform, string> = {
  webflow: 'Webflow',
  wordpress: 'WordPress',
  shopify: 'Shopify',
  html: 'HTML / سایتِ ساده',
  other: 'دیگر',
};

export const STATUS_LABELS: Record<LibraryStatus, string> = {
  draft: 'پیش‌نویس',
  ready: 'آماده',
  deprecated: 'منسوخ',
};

export const LANGUAGE_LABELS: Record<LibraryLanguage, string> = {
  html: 'HTML',
  css: 'CSS',
  js: 'JavaScript',
  json: 'JSON',
  php: 'PHP',
  liquid: 'Liquid',
  text: 'متن',
};

export const PLACEMENT_LABELS: Record<LibraryPlacement, string> = {
  site_head: 'کلِ سایت — داخلِ head',
  site_body_end: 'کلِ سایت — پیش از پایانِ body',
  page_head: 'یک صفحه — داخلِ head',
  page_body_end: 'یک صفحه — پیش از پایانِ body',
  embed: 'المنتِ Embed روی صفحه',
  external: 'فایل یا سرویسِ بیرونی',
  other: 'جای دیگر',
};

/** راهنمای هر جای نصب — زیرِ انتخابگر و کنارِ هر تکه‌کد. */
export const PLACEMENT_HINTS: Record<LibraryPlacement, string> = {
  site_head: 'Site settings ← Custom code ← Head code',
  site_body_end: 'Site settings ← Custom code ← Footer code',
  page_head: 'Page settings ← Custom code ← Inside <head> tag',
  page_body_end: 'Page settings ← Custom code ← Before </body> tag',
  embed: 'یک المنتِ Embed (</>) در همان جایی از صفحه که نوشته شده',
  external: 'مثلاً فایلِ CSS/JS روی CDN، یا تنظیمِ یک سرویسِ دیگر',
  other: 'توضیحِ جای دقیق را در یادداشتِ همین تکه بنویسید',
};

export const OPTION_KIND_LABELS: Record<LibraryOptionKind, string> = {
  attribute: 'Attribute',
  class: 'کلاس',
  id: 'ID',
  variable: 'متغیر',
  setting: 'تنظیم',
};

/** جای نصبِ پیش‌فرض برای هر زبان — نویسنده کمتر انتخاب کند. */
export function defaultPlacement(language: LibraryLanguage): LibraryPlacement {
  if (language === 'css') return 'site_head';
  if (language === 'html') return 'embed';
  if (language === 'js') return 'site_body_end';
  return 'other';
}

const isOneOf = <T extends string>(list: readonly T[]) => (value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

export const isKind = isOneOf(LIBRARY_KINDS);
export const isPlatform = isOneOf(LIBRARY_PLATFORMS);
export const isStatus = isOneOf(LIBRARY_STATUSES);
export const isLanguage = isOneOf(LIBRARY_LANGUAGES);
export const isPlacement = isOneOf(LIBRARY_PLACEMENTS);
export const isOptionKind = isOneOf(LIBRARY_OPTION_KINDS);

/** متنِ «هر خط یکی» ← فهرست؛ خطِ خالی و علامتِ فهرستِ دستی («- »، «1. ») حذف می‌شود. */
export function lines(text: string): string[] {
  return text.split(/\r?\n/)
    .map((l) => l.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((l) => l !== '');
}

/** پیوند فقط http(s) — `javascript:` و مانندش به صفحهٔ کسی نمی‌رسد. */
export function safeUrl(raw: string): string {
  const url = raw.trim();
  return /^https?:\/\/\S+$/i.test(url) ? url.slice(0, 500) : '';
}

/** برچسب‌ها: بی‌تکرار (بی‌حساسیت به بزرگی)، کوتاه، حداکثر ده‌تا. */
export function normalizeTopics(raw: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const topic = item.replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = topic.toLocaleLowerCase();
    if (!topic || seen.has(key)) continue;
    seen.add(key);
    out.push(topic);
    if (out.length === 10) break;
  }
  return out;
}

export const LIMITS = {
  title: 200,
  summary: 300,
  body: 20_000,
  list: 5_000,
  code: 100_000,
  blocks: 20,
  options: 50,
  label: 120,
  note: 500,
} as const;

export interface BlockInput {
  label: string;
  language: string;
  placement: string;
  placementNote: string;
  code: string;
}

export interface OptionInput {
  name: string;
  kind: string;
  description: string;
  defaultValue: string;
}

export interface EntryInput {
  kind: string;
  title: string;
  summary: string;
  platform: string;
  status: string;
  topics: readonly string[];
  body: string;
  steps: string;
  warnings: string;
  dependencies: string;
  demoUrl: string;
  clientVisible: boolean;
  originProjectId: number | null;
  blocks: readonly BlockInput[];
  options: readonly OptionInput[];
  relatedIds: readonly number[];
}

export interface CleanBlock {
  label: string;
  language: LibraryLanguage;
  placement: LibraryPlacement;
  placementNote: string;
  code: string;
}

export interface CleanOption {
  name: string;
  kind: LibraryOptionKind;
  description: string;
  defaultValue: string;
}

export interface CleanEntry {
  kind: LibraryKind;
  title: string;
  summary: string;
  platform: LibraryPlatform;
  status: LibraryStatus;
  topics: string[];
  body: string;
  steps: string;
  warnings: string;
  dependencies: string;
  demoUrl: string;
  clientVisible: boolean;
  originProjectId: number | null;
  blocks: CleanBlock[];
  options: CleanOption[];
  relatedIds: number[];
}

export type EntryError = 'title_required' | 'code_required' | 'too_long';

/** متن‌های خطا — متنِ مبدأ؛ UI ترجمه می‌کند. */
export const ENTRY_ERRORS: Record<EntryError, string> = {
  title_required: 'عنوان لازم است.',
  code_required: 'یک «کد» دست‌کم یک تکه‌کد لازم دارد.',
  too_long: 'متن یا کد از اندازهٔ مجاز بلندتر است.',
};

const clip = (value: string, max: number) => value.trim().slice(0, max);

/**
 * پاک‌سازیِ فرم — همهٔ قاعده‌ها یک‌جا، تا سرور و تست یک چیز را بسنجند.
 *
 * ⚠️ کد بریده نمی‌شود: کدِ نصفه از کدِ رد‌شده بدتر است، پس بلندتر از سقف خطا
 * می‌دهد. متن‌های توضیحی بی‌صدا کوتاه می‌شوند.
 * ⚠️ «کارفرما ببیند» فقط برای راهنمای کارفرماست؛ کد و یادداشتِ داخلی هرگز.
 */
export function cleanEntry(input: EntryInput): { ok: true; entry: CleanEntry } | { ok: false; error: EntryError } {
  const kind: LibraryKind = isKind(input.kind) ? input.kind : 'code';
  const title = clip(input.title, LIMITS.title);
  if (!title) return { ok: false, error: 'title_required' };

  const blocks: CleanBlock[] = [];
  for (const b of input.blocks.slice(0, LIMITS.blocks)) {
    // ⚠️ فقط فاصلهٔ ته حذف می‌شود؛ تورفتگیِ اولِ کد بخشی از کد است.
    const code = b.code.replace(/\s+$/, '');
    if (code.trim() === '') continue;
    if (code.length > LIMITS.code) return { ok: false, error: 'too_long' };
    const language: LibraryLanguage = isLanguage(b.language) ? b.language : 'text';
    blocks.push({
      label: clip(b.label, LIMITS.label),
      language,
      placement: isPlacement(b.placement) ? b.placement : defaultPlacement(language),
      placementNote: clip(b.placementNote, LIMITS.note),
      code,
    });
  }
  if (kind === 'code' && blocks.length === 0) return { ok: false, error: 'code_required' };

  const options: CleanOption[] = [];
  for (const o of input.options.slice(0, LIMITS.options)) {
    const name = clip(o.name, LIMITS.label);
    if (!name) continue;
    options.push({
      name,
      kind: isOptionKind(o.kind) ? o.kind : 'attribute',
      description: clip(o.description, LIMITS.note),
      defaultValue: clip(o.defaultValue, LIMITS.label),
    });
  }

  if (input.body.length > LIMITS.body) return { ok: false, error: 'too_long' };

  return {
    ok: true,
    entry: {
      kind,
      title,
      summary: clip(input.summary, LIMITS.summary).replace(/\s*\n\s*/g, ' '),
      platform: isPlatform(input.platform) ? input.platform : 'webflow',
      status: isStatus(input.status) ? input.status : 'ready',
      topics: normalizeTopics(input.topics),
      body: input.body.trim(),
      steps: lines(input.steps.slice(0, LIMITS.list)).join('\n'),
      warnings: lines(input.warnings.slice(0, LIMITS.list)).join('\n'),
      dependencies: lines(input.dependencies.slice(0, LIMITS.list)).join('\n'),
      demoUrl: safeUrl(input.demoUrl),
      clientVisible: kind === 'guide' && input.clientVisible,
      originProjectId: input.originProjectId && input.originProjectId > 0 ? input.originProjectId : null,
      blocks,
      options,
      relatedIds: [...new Set(input.relatedIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 20),
    },
  };
}

/* ------------------------------------------------------------------ *
 * دسترسی
 * ------------------------------------------------------------------ */

/**
 * کتابخانه مالِ **تیم** است: مالک، همکارِ ادمین و عضو.
 *
 * ⚠️ نقشِ مالی نه — همان قفلِ حسابدارِ نسخهٔ قبلی (فقط صفحه‌های مالی).
 * ⚠️ کارفرما هم نه: او فقط راهنمای کارفرمای پروژهٔ خودش را، داخلِ همان
 * پروژه، می‌بیند (`clientGuidesFor`).
 */
export function canUseLibrary(actor: Actor): boolean {
  return actor.roles.some((r) => r === 'owner' || r === 'admin' || r === 'member');
}

/**
 * ویرایش: نویسنده، یا مدیرِ سراسریِ پروژه‌ها (مالک هم همین را دارد).
 * ⚠️ عضوِ دیگر کدِ همکارش را عوض نمی‌کند؛ اگر نسخهٔ دیگری لازم دارد،
 * «نسخهٔ این پروژه» را می‌سازد.
 */
export function canEditEntry(actor: Actor, entry: { authorId: number | null }): boolean {
  if (!canUseLibrary(actor)) return false;
  return entry.authorId === actor.id || canManageSection(actor, 'projects');
}

/**
 * حذفِ کامل فقط وقتی روی هیچ پروژه‌ای نصب نیست — وگرنه تاریخچهٔ آن پروژه‌ها
 * می‌شکند؛ آن‌وقت «بایگانی» درست است.
 */
export function canDeleteEntry(actor: Actor, entry: { authorId: number | null }, installs: number): boolean {
  return installs === 0 && canEditEntry(actor, entry);
}

/** پیشوند و رنگِ نشانِ هر وضعیت — یک‌جا تا کارت و صفحه یکی باشند. */
export const STATUS_TONE: Record<LibraryStatus, 'secondary' | 'success' | 'warning'> = {
  draft: 'secondary',
  ready: 'success',
  deprecated: 'warning',
};

/* ------------------------------------------------------------------ *
 * پیشنهادِ ویرایش (۲.۴۶.۰)
 * ------------------------------------------------------------------ */

/**
 * پیشنهاد مالِ کسی است که کتابخانه را دارد ولی **نمی‌تواند** مستقیم ویرایش
 * کند؛ نویسنده و مدیر خودشان ذخیره می‌کنند.
 */
export function canSuggestEdit(actor: Actor, entry: { authorId: number | null }): boolean {
  return canUseLibrary(actor) && !canEditEntry(actor, entry);
}

/** فیلدهای متنیِ ساده‌ای که پیشنهاد می‌تواند عوض کند. */
export const SUGGESTION_TEXT_FIELDS = ['title', 'summary', 'steps', 'warnings', 'dependencies', 'body', 'demoUrl'] as const;
export type SuggestionTextField = (typeof SUGGESTION_TEXT_FIELDS)[number];
export type SuggestionPart = SuggestionTextField | 'topics' | 'blocks' | 'options';

/** برچسبِ هر بخش در صفحهٔ تفاوت. */
export const SUGGESTION_PART_LABELS: Record<SuggestionPart, string> = {
  title: 'عنوان',
  summary: 'در یک جمله',
  steps: 'گام‌ها',
  warnings: 'هشدارها',
  dependencies: 'پیش‌نیازها',
  body: 'توضیحات',
  demoUrl: 'نمونهٔ زنده',
  topics: 'برچسب‌ها',
  blocks: 'کدها',
  options: 'تنظیمات و گزینه‌ها',
};

/**
 * محتوایی که یک پیشنهاد عوض می‌کند.
 * ⚠️ نوع، وضعیت، پلتفرم، «کارفرما ببیند»، مبدأ، مرتبط‌ها و تصویرها نه —
 * این‌ها تصمیمِ نویسنده‌اند و پیشنهادِ متن نباید بی‌صدا آن‌ها را عوض کند.
 */
export interface SuggestedContent {
  title: string;
  summary: string;
  topics: string[];
  body: string;
  steps: string;
  warnings: string;
  dependencies: string;
  demoUrl: string;
  blocks: CleanBlock[];
  options: CleanOption[];
}

export const SUGGESTION_STATUS_LABELS: Record<LibrarySuggestionStatus, string> = {
  pending: 'منتظرِ بررسی',
  accepted: 'پذیرفته شد',
  rejected: 'رد شد',
  withdrawn: 'پس گرفته شد',
};

/** سقفِ «چه چیزی را بهتر کردید». */
export const SUGGESTION_NOTE_LIMIT = 1000;

/** فقط بخشِ محتوایی — از موردِ تمیزشده، عکسِ تاریخچه یا جزئیاتِ صفحه. */
export function contentOf(e: SuggestedContent): SuggestedContent {
  return {
    title: e.title, summary: e.summary, topics: [...e.topics], body: e.body, steps: e.steps,
    warnings: e.warnings, dependencies: e.dependencies, demoUrl: e.demoUrl,
    blocks: e.blocks.map(({ label, language, placement, placementNote, code }) => ({ label, language, placement, placementNote, code })),
    options: e.options.map(({ name, kind, description, defaultValue }) => ({ name, kind, description, defaultValue })),
  };
}

/** کدام بخش‌ها فرق دارند — خالی یعنی پیشنهاد چیزی را عوض نمی‌کند. */
export function changedParts(before: SuggestedContent, after: SuggestedContent): SuggestionPart[] {
  const a = contentOf(before);
  const b = contentOf(after);
  const out: SuggestionPart[] = [];
  for (const f of SUGGESTION_TEXT_FIELDS) if (a[f] !== b[f]) out.push(f);
  if (JSON.stringify(a.topics) !== JSON.stringify(b.topics)) out.push('topics');
  if (JSON.stringify(a.blocks) !== JSON.stringify(b.blocks)) out.push('blocks');
  if (JSON.stringify(a.options) !== JSON.stringify(b.options)) out.push('options');
  return out;
}

export interface DiffLine { op: 'same' | 'add' | 'del'; text: string }

/**
 * تفاوتِ خط‌به‌خط (LCS) — برای کد و متن‌های چندخطی.
 *
 * ⚠️ سرِ مشترک و تهِ مشترک اول جدا می‌شوند تا جدول فقط وسطِ عوض‌شده را
 * بسازد. اگر وسط هنوز خیلی بزرگ بود، همهٔ قبلی «حذف» و همهٔ بعدی «افزوده»
 * می‌آید — درست، فقط کمتر دقیق.
 */
export function lineDiff(before: string, after: string, maxCells = 4_000_000): DiffLine[] {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const same = (text: string): DiffLine => ({ op: 'same', text });
  const head = a.slice(0, start).map(same);
  const tail = a.slice(endA).map(same);
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n * m > maxCells) {
    return [
      ...head,
      ...midA.map((text): DiffLine => ({ op: 'del', text })),
      ...midB.map((text): DiffLine => ({ op: 'add', text })),
      ...tail,
    ];
  }
  const w = m + 1;
  const len = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      len[i * w + j] = midA[i] === midB[j]
        ? len[(i + 1) * w + j + 1]! + 1
        : Math.max(len[(i + 1) * w + j]!, len[i * w + j + 1]!);
    }
  }
  const mid: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) { mid.push(same(midA[i]!)); i += 1; j += 1; }
    else if (len[(i + 1) * w + j]! >= len[i * w + j + 1]!) { mid.push({ op: 'del', text: midA[i]! }); i += 1; }
    else { mid.push({ op: 'add', text: midB[j]! }); j += 1; }
  }
  while (i < n) mid.push({ op: 'del', text: midA[i++]! });
  while (j < m) mid.push({ op: 'add', text: midB[j++]! });
  return [...head, ...mid, ...tail];
}
