import type { Actor } from '@/domain/access/permissions';
import { canManageSection } from '@/domain/access/permissions';
import {
  LIBRARY_KINDS, LIBRARY_LANGUAGES, LIBRARY_OPTION_KINDS, LIBRARY_PLACEMENTS, LIBRARY_PLATFORMS, LIBRARY_STATUSES,
  type LibraryKind, type LibraryLanguage, type LibraryOptionKind, type LibraryPlacement, type LibraryPlatform,
  type LibraryStatus,
} from './kinds';

export {
  LIBRARY_KINDS, LIBRARY_LANGUAGES, LIBRARY_OPTION_KINDS, LIBRARY_PLACEMENTS, LIBRARY_PLATFORMS, LIBRARY_STATUSES,
};
export type {
  LibraryKind, LibraryLanguage, LibraryOptionKind, LibraryPlacement, LibraryPlatform, LibraryStatus,
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
