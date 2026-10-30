import type { Actor } from '@/domain/access/permissions';
import { canManageSection } from '@/domain/access/permissions';
import {
  LIBRARY_CATEGORIES, LIBRARY_KINDS, LIBRARY_LANGUAGES, LIBRARY_OPTION_KINDS, LIBRARY_OPTION_ROLES, LIBRARY_PLACEMENTS,
  LIBRARY_PLATFORMS, LIBRARY_STATUSES,
  type LibraryCategory, type LibraryKind, type LibraryLanguage, type LibraryOptionKind, type LibraryOptionRole,
  type LibraryPlacement, type LibraryPlatform, type LibraryStatus, type LibrarySuggestionStatus,
} from './kinds';

export {
  LIBRARY_CATEGORIES, LIBRARY_KINDS, LIBRARY_LANGUAGES, LIBRARY_OPTION_KINDS, LIBRARY_OPTION_ROLES, LIBRARY_PLACEMENTS,
  LIBRARY_PLATFORMS, LIBRARY_STATUSES,
};
export type {
  LibraryCategory, LibraryKind, LibraryLanguage, LibraryOptionKind, LibraryOptionRole, LibraryPlacement,
  LibraryPlatform, LibraryStatus, LibrarySuggestionStatus,
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

/** نامِ کوتاهِ هر جای نصب — دکمه‌های «کپیِ همهٔ …». */
export const PLACEMENT_SHORT_LABELS: Record<LibraryPlacement, string> = {
  site_head: 'Head سایت',
  site_body_end: 'Footer سایت',
  page_head: 'Head صفحه',
  page_body_end: 'Footer صفحه',
  embed: 'Embed',
  external: 'بیرونی',
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

/** دسته‌ها (۲.۴۷.۰) — ترتیبِ همین فهرست ترتیبِ گروه‌های صفحهٔ کتابخانه است. */
export const CATEGORY_LABELS: Record<LibraryCategory, string> = {
  slider: 'اسلایدر و کاروسل',
  menu: 'منو و ناوبری',
  animation: 'انیمیشن و افکت',
  form: 'فرم',
  cms: 'CMS و لیست‌ها',
  layout: 'چیدمان و گرید',
  media: 'تصویر، ویدیو و نقشه',
  integration: 'اتصال به سرویس‌ها',
  seo: 'سئو و متادیتا',
  utility: 'ابزار و پیش‌نیاز',
  checklist: 'چک‌لیست و قاعده',
  other: 'دیگر',
};

/** جایگاهِ گزینه — سرتیترِ هر گروه در صفحهٔ مورد. */
export const OPTION_ROLE_LABELS: Record<LibraryOptionRole, string> = {
  required: 'لازم',
  element: 'المنتِ اختیاری',
  setting: 'تنظیمِ اختیاری',
};

/** یک خط زیرِ هر گروه. */
export const OPTION_ROLE_HINTS: Record<LibraryOptionRole, string> = {
  required: 'بی‌این‌ها کار نمی‌کند — حداقلِ لازم.',
  element: 'المنت‌هایی که اگر بخواهید اضافه می‌کنید.',
  setting: 'رفتار را عوض می‌کنند؛ بی‌آن‌ها مقدارِ پیش‌فرض کار می‌کند.',
};

/** «تازه» و «به‌روز شد» تا این‌قدر روی کارت می‌ماند. */
export const FRESH_DAYS = 14;

/**
 * نشانِ کارت: موردِ تازه‌ساخته «تازه»، موردی که بعداً ویرایش شد «به‌روز شد».
 * ⚠️ ویرایشِ چند دقیقه پس از ساختن (اصلاحِ غلطِ تایپی) «به‌روز شد» حساب نمی‌شود.
 */
export function freshness(createdAt: Date, updatedAt: Date, now: Date = new Date()): 'new' | 'updated' | null {
  const window = FRESH_DAYS * 86_400_000;
  if (now.getTime() - createdAt.getTime() < window) return 'new';
  if (now.getTime() - updatedAt.getTime() < window && updatedAt.getTime() - createdAt.getTime() > 3_600_000) return 'updated';
  return null;
}

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
export const isOptionRole = isOneOf(LIBRARY_OPTION_ROLES);
export const isCategory = isOneOf(LIBRARY_CATEGORIES);

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
  steps: 40,
  stepBody: 5_000,
  allowed: 20,
  version: 30,
  changeNote: 300,
  related: 20,
} as const;

export interface BlockInput {
  label: string;
  language: string;
  placement: string;
  placementNote: string;
  code: string;
}

export interface AllowedValue {
  value: string;
  description: string;
}

export interface OptionInput {
  name: string;
  kind: string;
  description: string;
  defaultValue: string;
  role?: string;
  value?: string;
  element?: string;
  target?: string;
  allowedValues?: readonly AllowedValue[];
  important?: string;
  example?: string;
}

/**
 * یک گام در فرم. ⚠️ `blockIndexes` جایگاهِ تکه در فهرستِ **فرستاده‌شده** است؛
 * پاک‌سازی آن را به جایگاهِ پس از حذفِ تکه‌های خالی برمی‌گرداند.
 * `key` فقط برای وصلِ تصویرهای تازهٔ همین ارسال به همین گام است.
 */
export interface StepInput {
  key?: string;
  title: string;
  body: string;
  blockIndexes: readonly number[];
  optionNames: readonly string[];
  mediaIds: readonly number[];
  /** شمارِ تصویرهای تازه‌ای که همراهِ همین گام آپلود می‌شوند. */
  pendingMedia?: number;
}

export interface RelatedInput {
  id: number;
  note: string;
}

export interface EntryInput {
  kind: string;
  title: string;
  summary: string;
  platform: string;
  status: string;
  category?: string;
  versionLabel?: string;
  topics: readonly string[];
  body: string;
  steps: readonly StepInput[];
  warnings: string;
  dependencies: string;
  demoUrl: string;
  videoUrl?: string;
  cloneableUrl?: string;
  instances?: string;
  /** «چه چیزی عوض شد» — فقط هنگامِ ویرایش معنا دارد. */
  changeNote?: string;
  clientVisible: boolean;
  originProjectId: number | null;
  blocks: readonly BlockInput[];
  options: readonly OptionInput[];
  related: readonly RelatedInput[];
  requiresIds?: readonly number[];
  /** این مورد نسخهٔ تازهٔ کدام مورد است. */
  replacesId?: number | null;
  /** تصویرِ شاخص (id ِ پیوستِ همین مورد). */
  coverMediaId?: number | null;
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
  role: LibraryOptionRole;
  description: string;
  value: string;
  defaultValue: string;
  element: string;
  target: string;
  allowedValues: AllowedValue[];
  important: string;
  example: string;
}

export interface CleanStep {
  title: string;
  body: string;
  blockIndexes: number[];
  optionNames: string[];
  mediaIds: number[];
}

export interface CleanEntry {
  kind: LibraryKind;
  title: string;
  summary: string;
  platform: LibraryPlatform;
  status: LibraryStatus;
  category: LibraryCategory | '';
  versionLabel: string;
  topics: string[];
  body: string;
  warnings: string;
  dependencies: string;
  demoUrl: string;
  videoUrl: string;
  cloneableUrl: string;
  instances: string;
  changeNote: string;
  clientVisible: boolean;
  originProjectId: number | null;
  blocks: CleanBlock[];
  options: CleanOption[];
  /** گام‌ها، هر کدام با `key` ِ فرم (برای تصویرهای تازه). */
  steps: Array<CleanStep & { key: string }>;
  related: RelatedInput[];
  requiresIds: number[];
  replacesId: number | null;
  coverMediaId: number | null;
}

export type EntryError = 'title_required' | 'code_required' | 'too_long';

/** متن‌های خطا — متنِ مبدأ؛ UI ترجمه می‌کند. */
export const ENTRY_ERRORS: Record<EntryError, string> = {
  title_required: 'عنوان لازم است.',
  code_required: 'یک «کد» دست‌کم یک تکه‌کد لازم دارد.',
  too_long: 'متن یا کد از اندازهٔ مجاز بلندتر است.',
};

const clip = (value: string, max: number) => value.trim().slice(0, max);
const oneLine = (value: string, max: number) => clip(value, max).replace(/\s*\n\s*/g, ' ');
const posIds = (list: readonly number[] | undefined, max: number) =>
  [...new Set((list ?? []).filter((id) => Number.isInteger(id) && id > 0))].slice(0, max);

/** «مقدار — توضیح» در هر خط ← فهرستِ مقدارهای مجاز (فرم با همین شکل می‌نویسد). */
export function parseAllowed(text: string): AllowedValue[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(.+?)\s+[—–-]\s+(.+)$/.exec(l);
    return m ? { value: m[1]!.trim(), description: m[2]!.trim() } : { value: l, description: '' };
  });
}

export function formatAllowed(list: readonly AllowedValue[]): string {
  return list.map((a) => (a.description ? `${a.value} — ${a.description}` : a.value)).join('\n');
}

/**
 * شناسهٔ یک گزینه: نام، و اگر مقدارِ ثابت دارد «نام=مقدار».
 * ⚠️ یک attribute با چند مقدار چند گزینه است (`fs-rangeslider-element` =
 * wrapper / track / fill)؛ گام‌ها و تفاوتِ پیشنهاد گزینه را با همین پیدا می‌کنند.
 */
export function optionKey(o: { name: string; value?: string }): string {
  return o.value ? `${o.name}=${o.value}` : o.name;
}

/** پاک‌سازیِ یک گزینه — `null` اگر نام ندارد. */
export function cleanOption(o: OptionInput): CleanOption | null {
  const name = oneLine(o.name, LIMITS.label);
  if (!name) return null;
  const allowed: AllowedValue[] = [];
  for (const a of o.allowedValues ?? []) {
    const value = oneLine(String(a?.value ?? ''), LIMITS.label);
    if (!value || allowed.some((x) => x.value === value)) continue;
    allowed.push({ value, description: oneLine(String(a?.description ?? ''), LIMITS.note) });
    if (allowed.length === LIMITS.allowed) break;
  }
  return {
    name,
    kind: isOptionKind(o.kind) ? o.kind : 'attribute',
    role: isOptionRole(o.role) ? o.role : 'setting',
    description: clip(o.description, LIMITS.note),
    value: oneLine(o.value ?? '', 300),
    defaultValue: oneLine(o.defaultValue, LIMITS.label),
    element: oneLine(o.element ?? '', 200),
    target: oneLine(o.target ?? '', 300),
    allowedValues: allowed,
    important: clip(o.important ?? '', LIMITS.note),
    example: clip(o.example ?? '', LIMITS.note),
  };
}

/** گام‌های متنیِ قدیمی (هر خط یک گام، پیش از ۲.۴۷.۰) ← گام‌های ساختاریافته. */
export function stepsFromText(text: string): CleanStep[] {
  return lines(text).map((title) => ({ title, body: '', blockIndexes: [], optionNames: [], mediaIds: [] }));
}

/**
 * پاک‌سازیِ فرم — همهٔ قاعده‌ها یک‌جا، تا سرور و تست یک چیز را بسنجند.
 *
 * ⚠️ کد بریده نمی‌شود: کدِ نصفه از کدِ رد‌شده بدتر است، پس بلندتر از سقف خطا
 * می‌دهد. متن‌های توضیحی بی‌صدا کوتاه می‌شوند.
 * ⚠️ «کارفرما ببیند» فقط برای راهنمای کارفرماست؛ کد و یادداشتِ داخلی هرگز.
 * ⚠️ ارجاعِ گام به تکه‌کد با جایگاه است: تکه‌های خالی حذف می‌شوند و جایگاهِ
 * بقیه جابه‌جا می‌شود، پس ارجاع‌ها همین‌جا به جایگاهِ تازه برگردانده می‌شوند.
 */
export function cleanEntry(input: EntryInput): { ok: true; entry: CleanEntry } | { ok: false; error: EntryError } {
  const kind: LibraryKind = isKind(input.kind) ? input.kind : 'code';
  const title = clip(input.title, LIMITS.title);
  if (!title) return { ok: false, error: 'title_required' };

  const blocks: CleanBlock[] = [];
  /** جایگاهِ فرستاده‌شده ← جایگاهِ پس از پاک‌سازی. */
  const blockAt = new Map<number, number>();
  for (const [i, b] of input.blocks.slice(0, LIMITS.blocks).entries()) {
    // ⚠️ فقط فاصلهٔ ته حذف می‌شود؛ تورفتگیِ اولِ کد بخشی از کد است.
    const code = b.code.replace(/\s+$/, '');
    if (code.trim() === '') continue;
    if (code.length > LIMITS.code) return { ok: false, error: 'too_long' };
    const language: LibraryLanguage = isLanguage(b.language) ? b.language : 'text';
    blockAt.set(i, blocks.length);
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
    const clean = cleanOption(o);
    // ⚠️ شناسهٔ تکراری نه: گام‌ها و تفاوتِ پیشنهاد گزینه را با `optionKey` پیدا می‌کنند.
    if (clean && !options.some((x) => optionKey(x) === optionKey(clean))) options.push(clean);
  }
  const optionKeys = new Set(options.map(optionKey));

  const steps: CleanEntry['steps'] = [];
  for (const s of input.steps.slice(0, LIMITS.steps)) {
    const step = {
      key: String(s.key ?? '').slice(0, 40),
      title: oneLine(s.title, LIMITS.title),
      body: clip(s.body, LIMITS.stepBody),
      blockIndexes: [...new Set(s.blockIndexes.map((i) => blockAt.get(i)).filter((i): i is number => i !== undefined))],
      optionNames: [...new Set(s.optionNames.map((n) => n.trim()).filter((n) => optionKeys.has(n)))],
      mediaIds: posIds(s.mediaIds, 20),
    };
    const empty = !step.title && !step.body && step.blockIndexes.length === 0 && step.optionNames.length === 0
      && step.mediaIds.length === 0 && !(s.pendingMedia && s.pendingMedia > 0);
    if (!empty) steps.push(step);
  }

  if (input.body.length > LIMITS.body) return { ok: false, error: 'too_long' };

  const related: RelatedInput[] = [];
  for (const r of input.related) {
    if (!Number.isInteger(r.id) || r.id <= 0 || related.some((x) => x.id === r.id)) continue;
    related.push({ id: r.id, note: oneLine(r.note ?? '', LIMITS.note) });
    if (related.length === LIMITS.related) break;
  }
  const replacesId = input.replacesId && input.replacesId > 0 ? input.replacesId : null;

  return {
    ok: true,
    entry: {
      kind,
      title,
      summary: oneLine(input.summary, LIMITS.summary),
      platform: isPlatform(input.platform) ? input.platform : 'webflow',
      status: isStatus(input.status) ? input.status : 'ready',
      category: isCategory(input.category) ? input.category : '',
      versionLabel: oneLine(input.versionLabel ?? '', LIMITS.version),
      topics: normalizeTopics(input.topics),
      body: input.body.trim(),
      warnings: lines(input.warnings.slice(0, LIMITS.list)).join('\n'),
      dependencies: lines(input.dependencies.slice(0, LIMITS.list)).join('\n'),
      demoUrl: safeUrl(input.demoUrl),
      videoUrl: safeUrl(input.videoUrl ?? ''),
      cloneableUrl: safeUrl(input.cloneableUrl ?? ''),
      instances: lines((input.instances ?? '').slice(0, LIMITS.list)).join('\n'),
      changeNote: oneLine(input.changeNote ?? '', LIMITS.changeNote),
      clientVisible: kind === 'guide' && input.clientVisible,
      originProjectId: input.originProjectId && input.originProjectId > 0 ? input.originProjectId : null,
      blocks,
      options,
      steps,
      related,
      requiresIds: posIds(input.requiresIds, LIMITS.related),
      replacesId,
      coverMediaId: input.coverMediaId && input.coverMediaId > 0 ? input.coverMediaId : null,
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
export const SUGGESTION_TEXT_FIELDS = [
  'title', 'summary', 'warnings', 'dependencies', 'instances', 'body', 'demoUrl', 'videoUrl', 'cloneableUrl',
] as const;
export type SuggestionTextField = (typeof SUGGESTION_TEXT_FIELDS)[number];
export type SuggestionPart = SuggestionTextField | 'topics' | 'steps' | 'blocks' | 'options';

/** برچسبِ هر بخش در صفحهٔ تفاوت. */
export const SUGGESTION_PART_LABELS: Record<SuggestionPart, string> = {
  title: 'عنوان',
  summary: 'در یک جمله',
  steps: 'گام‌ها',
  warnings: 'هشدارها',
  dependencies: 'پیش‌نیازها',
  instances: 'استفادهٔ چندباره در یک صفحه',
  body: 'توضیحات',
  demoUrl: 'نمونهٔ زنده',
  videoUrl: 'ویدیوی آموزشی',
  cloneableUrl: 'Cloneable',
  topics: 'برچسب‌ها',
  blocks: 'کدها',
  options: 'تنظیمات و گزینه‌ها',
};

/**
 * محتوایی که یک پیشنهاد عوض می‌کند.
 * ⚠️ نوع، وضعیت، پلتفرم، دسته، نسخه، «کارفرما ببیند»، مبدأ، مرتبط‌ها،
 * پیش‌نیازها و تصویرها نه — این‌ها تصمیمِ نویسنده‌اند و پیشنهادِ متن نباید
 * بی‌صدا آن‌ها را عوض کند. ⚠️ گام می‌تواند تصویرهای **موجودِ** مورد را جابه‌جا
 * یا برداشت کند، ولی تصویرِ تازه نمی‌آورد.
 */
export interface SuggestedContent {
  title: string;
  summary: string;
  topics: string[];
  body: string;
  steps: CleanStep[];
  warnings: string;
  dependencies: string;
  instances: string;
  demoUrl: string;
  videoUrl: string;
  cloneableUrl: string;
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

const pickStep = (s: CleanStep): CleanStep => ({
  title: s.title, body: s.body, blockIndexes: [...s.blockIndexes], optionNames: [...s.optionNames], mediaIds: [...s.mediaIds],
});
const pickBlock = ({ label, language, placement, placementNote, code }: CleanBlock): CleanBlock =>
  ({ label, language, placement, placementNote, code });
export const pickOption = (o: CleanOption): CleanOption => ({
  name: o.name, kind: o.kind, role: o.role, description: o.description, value: o.value, defaultValue: o.defaultValue,
  element: o.element, target: o.target, allowedValues: o.allowedValues.map((a) => ({ value: a.value, description: a.description })),
  important: o.important, example: o.example,
});

/** فقط بخشِ محتوایی — از موردِ تمیزشده، عکسِ تاریخچه یا جزئیاتِ صفحه. */
export function contentOf(e: SuggestedContent): SuggestedContent {
  return {
    title: e.title, summary: e.summary, topics: [...e.topics], body: e.body, steps: e.steps.map(pickStep),
    warnings: e.warnings, dependencies: e.dependencies, instances: e.instances, demoUrl: e.demoUrl,
    videoUrl: e.videoUrl, cloneableUrl: e.cloneableUrl,
    blocks: e.blocks.map(pickBlock),
    options: e.options.map(pickOption),
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const nums = (v: unknown) => arr(v).map(Number).filter((n) => Number.isInteger(n) && n >= 0);

/** یک گزینهٔ ذخیره‌شده (شاید پیش از ۲.۴۷.۰) ← شکلِ کامل. */
function normalizeOption(raw: unknown): CleanOption {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(o.name),
    kind: isOptionKind(o.kind) ? o.kind : 'attribute',
    role: isOptionRole(o.role) ? o.role : 'setting',
    description: str(o.description),
    value: str(o.value),
    defaultValue: str(o.defaultValue),
    element: str(o.element),
    target: str(o.target),
    allowedValues: arr(o.allowedValues).map((a) => {
      const x = (a ?? {}) as Record<string, unknown>;
      return { value: str(x.value), description: str(x.description) };
    }),
    important: str(o.important),
    example: str(o.example),
  };
}

/**
 * محتوای ذخیره‌شده در JSON (پیشنهاد یا عکسِ تاریخچه) ← شکلِ امروز.
 *
 * ⚠️ چرا: پیشنهادها و نسخه‌های پیش از ۲.۴۷.۰ گام‌ها را «هر خط یک گام» و
 * گزینه را بی‌فیلدهای تازه ذخیره کرده‌اند. خواندنِ بی‌این، صفحهٔ تفاوت یا
 * «بازگرداندن» را می‌شکست.
 */
export function normalizeContent(raw: unknown): SuggestedContent {
  const c = (raw ?? {}) as Record<string, unknown>;
  const steps = typeof c.steps === 'string'
    ? stepsFromText(c.steps)
    : arr(c.steps).map((s) => {
      const x = (s ?? {}) as Record<string, unknown>;
      return {
        title: str(x.title), body: str(x.body), blockIndexes: nums(x.blockIndexes),
        optionNames: arr(x.optionNames).map(str).filter(Boolean), mediaIds: nums(x.mediaIds).filter((n) => n > 0),
      };
    });
  return {
    title: str(c.title),
    summary: str(c.summary),
    topics: arr(c.topics).map(str).filter(Boolean),
    body: str(c.body),
    steps,
    warnings: str(c.warnings),
    dependencies: str(c.dependencies),
    instances: str(c.instances),
    demoUrl: str(c.demoUrl),
    videoUrl: str(c.videoUrl),
    cloneableUrl: str(c.cloneableUrl),
    blocks: arr(c.blocks).map((b) => {
      const x = (b ?? {}) as Record<string, unknown>;
      const language: LibraryLanguage = isLanguage(x.language) ? x.language : 'text';
      return {
        label: str(x.label), language, placement: isPlacement(x.placement) ? x.placement : defaultPlacement(language),
        placementNote: str(x.placementNote), code: str(x.code),
      };
    }),
    options: arr(c.options).map(normalizeOption),
  };
}

/** کدام بخش‌ها فرق دارند — خالی یعنی پیشنهاد چیزی را عوض نمی‌کند. */
export function changedParts(before: SuggestedContent, after: SuggestedContent): SuggestionPart[] {
  const a = contentOf(before);
  const b = contentOf(after);
  const out: SuggestionPart[] = [];
  for (const f of SUGGESTION_TEXT_FIELDS) if (a[f] !== b[f]) out.push(f);
  if (JSON.stringify(a.topics) !== JSON.stringify(b.topics)) out.push('topics');
  if (JSON.stringify(a.steps) !== JSON.stringify(b.steps)) out.push('steps');
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

/* ------------------------------------------------------------------ *
 * کدِ یک‌جای پروژه (۲.۴۷.۰)
 * ------------------------------------------------------------------ */

/** جاهایی که کدشان یک‌جا در تنظیماتِ سایت یا صفحه چسبانده می‌شود. */
export const COMBINED_PLACEMENTS = ['site_head', 'site_body_end', 'page_head', 'page_body_end'] as const;
export type CombinedPlacement = (typeof COMBINED_PLACEMENTS)[number];

export interface InstalledForCode {
  entryId: number;
  title: string;
  /** پیش‌نیازهای کتابخانه‌ای ِ همین مورد که روی پروژه نصب‌اند. */
  requires: readonly number[];
  blocks: readonly Pick<CleanBlock, 'label' | 'language' | 'placement' | 'code'>[];
}

/**
 * کدی که کنارِ تکه‌های دیگر در یک کادرِ «Custom code» چسبانده می‌شود.
 * ⚠️ Webflow آن کادر را HTML می‌خواند: CSS یا JS ِ خام بی‌برچسب آنجا متن
 * می‌شود، پس اگر خودِ تکه `<style>`/`<script>` ندارد، دورش گذاشته می‌شود.
 */
export function pasteReady(b: Pick<CleanBlock, 'language' | 'code'>): string {
  const code = b.code.trim();
  if (b.language === 'css' && !/<style[\s>]/i.test(code) && !/<link[\s>]/i.test(code)) return `<style>\n${code}\n</style>`;
  if (b.language === 'js' && !/<script[\s>]/i.test(code)) return `<script>\n${code}\n</script>`;
  return code;
}

export interface CombinedPart { entryId: number; title: string; label: string; code: string }

export interface CombinedGroup {
  placement: CombinedPlacement;
  parts: CombinedPart[];
  /** متنِ آمادهٔ چسباندن — هر تکه با یک خطِ توضیحِ HTML که از کجا آمده. */
  code: string;
}

/**
 * کدِ Head و Footer ِ کلِ پروژه از همهٔ موردهای نصب‌شده.
 *
 * ⚠️ پیش‌نیاز پیش از موردی می‌آید که لازمش دارد (اسکریپتِ GSAP پیش از
 * انیمیشن)، و تکه‌ای که کدش عیناً تکراری است فقط یک بار — همان «این
 * اسکریپت را فقط یک بار بگذارید».
 * ⚠️ «Embed» و «جای دیگر» اینجا نمی‌آیند: جایشان صفحه به صفحه فرق دارد.
 */
export function combineProjectCode(items: readonly InstalledForCode[]): CombinedGroup[] {
  const byId = new Map(items.map((i) => [i.entryId, i]));
  const order: InstalledForCode[] = [];
  const state = new Map<number, 'visiting' | 'done'>();
  const visit = (item: InstalledForCode) => {
    if (state.get(item.entryId)) return; // ⚠️ دورِ پیش‌نیازها حلقهٔ بی‌پایان نسازد.
    state.set(item.entryId, 'visiting');
    for (const r of item.requires) {
      const dep = byId.get(r);
      if (dep) visit(dep);
    }
    state.set(item.entryId, 'done');
    order.push(item);
  };
  for (const item of items) visit(item);

  const groups: CombinedGroup[] = [];
  for (const placement of COMBINED_PLACEMENTS) {
    const seen = new Set<string>();
    const parts: CombinedPart[] = [];
    for (const item of order) {
      for (const b of item.blocks) {
        if (b.placement !== placement) continue;
        const key = b.code.trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        parts.push({ entryId: item.entryId, title: item.title, label: b.label, code: pasteReady(b) });
      }
    }
    if (parts.length === 0) continue;
    const comment = (p: CombinedPart) => `<!-- ${[p.title, p.label].filter(Boolean).join(' · ').replace(/--/g, '—')} -->`;
    groups.push({ placement, parts, code: parts.map((p) => `${comment(p)}\n${p.code}`).join('\n\n') });
  }
  return groups;
}
