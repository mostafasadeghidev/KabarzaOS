/**
 * نمایشِ خوانای پیوندهای بیرونی — نامِ سرویس، عنوانِ خوانا، و جداکردنِ
 * پیوندهای تک‌خطیِ متن به کارت (۲.۳.۰).
 *
 * ⚠️ چرا: توضیحِ پروژه‌ها پر از نشانیِ بلندِ فیگما بود
 * (`…/design/miEDmf…/Peppers-Unlimited-|-UI-Kit?m=auto&t=…`) که نه خوانا بود
 * نه زیبا. اینجا فقط از **خودِ نشانی** خوانده می‌شود — هیچ درخواستی به
 * سرویسِ بیرونی نمی‌رود (پس SSRF و نشتِ IP ندارد).
 */

export type LinkProvider =
  | 'figma' | 'webflow' | 'drive' | 'miro' | 'video' | 'code' | 'dropbox' | 'web';

/** نامِ نمایشیِ هر سرویس — نامِ برند ترجمه نمی‌شود. */
export const PROVIDER_NAME: Record<Exclude<LinkProvider, 'web'>, string> = {
  figma: 'Figma',
  webflow: 'Webflow',
  drive: 'Google Drive',
  miro: 'Miro',
  video: 'Video',
  code: 'Git',
  dropbox: 'Dropbox',
};

const RULES: Array<[RegExp, LinkProvider]> = [
  [/(^|\.)figma\.com$/, 'figma'],
  [/(^|\.)webflow\.(io|com)$/, 'webflow'],
  [/^(docs|drive|sheets|slides)\.google\.com$/, 'drive'],
  [/(^|\.)miro\.com$/, 'miro'],
  [/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|loom\.com)$/, 'video'],
  [/(^|\.)(github\.com|gitlab\.com|bitbucket\.org)$/, 'code'],
  [/(^|\.)dropbox\.com$/, 'dropbox'],
];

function parse(href: string): URL | null {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** دامنه بی `www.` — «figma.com». */
export function hostOf(href: string): string {
  return parse(href)?.hostname.replace(/^www\./, '') ?? '';
}

export function linkProvider(href: string): LinkProvider {
  const host = hostOf(href);
  return RULES.find(([re]) => re.test(host))?.[1] ?? 'web';
}

/** نامِ سرویس، یا دامنه برای سایتِ ناشناخته. */
export function providerName(href: string): string {
  const p = linkProvider(href);
  return p === 'web' ? hostOf(href) : PROVIDER_NAME[p];
}

const GOOGLE_KIND: Record<string, string> = {
  document: 'Google Docs',
  spreadsheets: 'Google Sheets',
  presentation: 'Google Slides',
  forms: 'Google Forms',
  folders: 'Google Drive',
  file: 'Google Drive',
};

/** تکهٔ مسیر به متنِ خوانا: «Peppers-Unlimited-|-UI-Kit» → «Peppers Unlimited | UI Kit». */
function readable(segment: string): string {
  let s = segment;
  try { s = decodeURIComponent(segment); } catch { /* نشانیِ نیمه‌کدشده — همان خام */ }
  return s.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * عنوانِ خوانا از خودِ نشانی.
 * - فیگما: نامِ فایل بعد از کلیدِ آن (`/design/<key>/<name>`).
 * - بقیه: آخرین تکهٔ معنادارِ مسیر؛ وگرنه دامنه.
 */
export function linkTitle(href: string): string {
  const url = parse(href);
  if (!url) return href;
  const parts = url.pathname.split('/').filter(Boolean);

  if (linkProvider(href) === 'figma') {
    const i = parts.findIndex((p) => /^(design|file|proto|board|slides|make)$/.test(p));
    const name = i >= 0 ? parts[i + 2] : undefined;
    if (name) return readable(name);
  }

  // گوگل نامِ سند را در نشانی ندارد؛ نوعِ سند گویاتر از شناسه است.
  if (linkProvider(href) === 'drive') {
    const kind = parts[0] === 'drive' ? 'folders' : parts[0];
    return GOOGLE_KIND[kind ?? ''] ?? 'Google Drive';
  }

  // شناسه‌های بی‌معنا (کلیدِ طولانی، عدد، edit/view) عنوان نمی‌شوند.
  const meaningful = parts.filter((p) => !/^(edit|view|d|u|\d+|[A-Za-z0-9_-]{20,})$/.test(p));
  const last = meaningful[meaningful.length - 1];
  return last ? readable(last) || url.hostname.replace(/^www\./, '') : url.hostname.replace(/^www\./, '');
}

export interface LinkCardData {
  href: string;
  /** برچسبِ کنارِ نشانی در متن («Figma (team)»)؛ نبودش = null. */
  label: string | null;
}

const LINE_LINK = /^\s*(?:[-*•]\s*)?(?:([^\n:：]{1,40}?)\s*[:：]\s*)?(https?:\/\/\S+?)[.,;)]*\s*$/;

/**
 * خط‌هایی که **فقط** یک پیوند دارند (با یا بی برچسب: «Figma: https://…»)
 * از متن جدا و کارت می‌شوند؛ پیوندِ وسطِ جمله سرِ جایش می‌ماند.
 *
 * ⚠️ متن خودش دست نمی‌خورد — فقط آن خط‌ها برداشته می‌شوند، و خط‌های خالیِ
 * پشتِ‌سرِ هم که به جا می‌مانند یکی می‌شوند.
 */
export function extractLinkCards(text: string): { text: string; cards: LinkCardData[] } {
  const cards: LinkCardData[] = [];
  const kept: string[] = [];
  for (const line of text.split('\n')) {
    const m = LINE_LINK.exec(line);
    if (m && parse(m[2]!)) {
      cards.push({ href: m[2]!, label: m[1]?.trim() || null });
    } else {
      kept.push(line);
    }
  }
  const rest = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: rest, cards };
}
