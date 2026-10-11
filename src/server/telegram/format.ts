/**
 * زبانِ دیداریِ پیام‌های تلگرام (۲.۲۳.۰) — یک جا برای همه: ربات، اعلان، گروهِ
 * پروژه، گزارشِ صبحگاهی و گزارشِ روزانه.
 *
 * قالب:
 *  - سرتیتر: «📋 <b>عنوان</b>» و اگر شمار دارد «(۳)»؛ بعد یک خطِ خالی.
 *  - ردیف: «• عنوان — توضیح · توضیح»؛ خطِ دوم با سه فاصله و آیکون.
 *  - شمارهٔ تسک: <code>ALZ-325</code> — با یک ضربه کپی می‌شود و فرستادنش کارت را باز می‌کند.
 *  - راهنمای پایینِ پیام: <i>کج</i>.
 *  - مدت «1:30»، تاریخ «YYYY-MM-DD» (رقمِ لاتین، همان قراردادِ برنامه)، مبلغ با جداکننده و کدِ ارز.
 *
 * ⚠️ همهٔ پیام‌ها با `parse_mode: HTML` می‌روند؛ **هر** متنِ کاربر (عنوان، نام،
 * کامنت، جوابِ هوشِ مصنوعی) باید از `esc` بگذرد. کمکی‌های این فایل خودشان
 * escape می‌کنند؛ فقط `*Html` ها ورودیِ آماده می‌گیرند.
 */

import { formatDateTime } from '@/i18n/datetime';

/** خط‌شکنی. */
export const NL = '\n';

/** حالتِ قالب‌بندیِ همهٔ پیام‌ها. */
export const HTML = 'HTML' as const;

/** متنِ کاربر برای `parse_mode: HTML`. */
export function esc(text: string | number | null | undefined): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const bold = (text: string | number) => `<b>${esc(text)}</b>`;
export const italic = (text: string | number) => `<i>${esc(text)}</i>`;
export const code = (text: string | number) => `<code>${esc(text)}</code>`;

/** کوتاه‌کردنِ متنِ ساده (پیش از escape) با «…». */
export function clip(text: string, max: number): string {
  const s = text.trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** سرتیترِ پیام یا بخش: «📋 <b>تسک‌های باز</b> (۳)». */
export function heading(icon: string, title: string, count?: number): string {
  return `${icon} <b>${esc(title)}</b>${count === undefined ? '' : ` (${count})`}`;
}

/**
 * یک ردیف: «• الف — ب · ج». تکه‌های خالی حذف می‌شوند تا «— » ِ آویزان نماند.
 * ورودی HTML ِ آماده است؛ برای متنِ ساده `bullet` را بزنید.
 */
export function bulletHtml(head: string, ...rest: Array<string | null | undefined | false>): string {
  const parts = rest.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  if (parts.length === 0) return `• ${head}`;
  const [first, ...more] = parts;
  return `• ${head} — ${first}${more.length ? ` · ${more.join(' · ')}` : ''}`;
}

/** همان ردیف با متنِ ساده (escape می‌شود). */
export function bullet(head: string, ...rest: Array<string | null | undefined | false>): string {
  return bulletHtml(esc(head), ...rest.map((x) => (typeof x === 'string' ? esc(x) : x)));
}

/** خطِ دومِ یک ردیف: «   📁 پروژه · 📅 امروز» (ورودی HTML ِ آماده). */
export function subline(...parts: Array<string | null | undefined | false>): string {
  const list = parts.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return list.length > 0 ? `   ${list.join(' · ')}` : '';
}

/** راهنمای کوتاهِ پایینِ پیام. */
export function hint(text: string): string {
  return `<i>${esc(text)}</i>`;
}

/** نقل‌قول (کامنت، توضیح) — بلندش در تلگرام جمع‌شده نشان داده می‌شود. */
export function quote(text: string, max = 1500): string {
  const body = clip(text, max);
  return `<blockquote${body.split(NL).length > 3 || body.length > 300 ? ' expandable' : ''}>${esc(body)}</blockquote>`;
}

/** مدت «1:30». */
export function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** فردای یک تاریخِ `YYYY-MM-DD`. */
function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * ددلاین برای فهرست‌ها: «⚠️ 2026-10-01 · دیرکرد»، «📅 امروز»، «📅 فردا»، «📅 2026-10-20».
 * `today` روزِ خودِ بیننده است (منطقهٔ زمانیِ او).
 */
export function dueHtml(due: string | null | undefined, today: string, tr: (s: string) => string): string {
  if (!due) return '';
  if (due < today) return `⚠️ ${esc(due)} · ${esc(tr('دیرکرد'))}`;
  if (due === today) return `📅 ${esc(tr('امروز'))}`;
  if (due === nextDay(today)) return `📅 ${esc(tr('فردا'))}`;
  return `📅 ${esc(due)}`;
}

/**
 * زمانِ یک رویداد (جلسه، یادآور) در منطقهٔ زمانیِ بیننده: «امروز 10:00»،
 * «فردا 09:30»، وگرنه «2026-10-20 14:00».
 */
export function whenHtml(at: Date | string, tz: string, today: string, tr: (s: string) => string): string {
  const s = formatDateTime(at, tz);
  const [day, time] = s.split(' ');
  if (day === today) return `${esc(tr('امروز'))} ${esc(time)}`;
  if (day === nextDay(today)) return `${esc(tr('فردا'))} ${esc(time)}`;
  return esc(s);
}

/** «و ۵ مورد دیگر» زیرِ فهرستِ بریده‌شده؛ اگر چیزی نمانده، هیچ. */
export function moreHtml(total: number, shown: number, tr: (s: string, p?: Record<string, string | number>) => string): string {
  return total > shown ? `<i>${esc(tr('و {n} مورد دیگر', { n: total - shown }))}</i>` : '';
}

/* ---------------- HTML ِ امن برای بریدن و تکه‌کردن ---------------- */

const TOKEN = /<(\/?)([a-z-]+)(?:\s[^>]*)?>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|[^<&]+|[<&]/gi;

/** تگ‌های بازِ یک تکه HTML، به ترتیب (برای بستن و دوباره بازکردن). */
function openTags(html: string, start: string[] = []): string[] {
  const stack = [...start];
  for (const m of html.matchAll(TOKEN)) {
    if (!m[2]) continue;
    const name = m[2].toLowerCase();
    if (m[1]) {
      const at = stack.map(tagName).lastIndexOf(name);
      if (at >= 0) stack.splice(at, 1);
    } else {
      stack.push(m[0]);
    }
  }
  return stack;
}

function tagName(open: string): string {
  return /^<([a-z-]+)/i.exec(open)?.[1]?.toLowerCase() ?? '';
}

const closers = (stack: string[]) => [...stack].reverse().map((t) => `</${tagName(t)}>`).join('');

/** نیمهٔ اولِ جفتِ جایگزین (ایموجی) تنها نماند. */
function dropLoneSurrogate(s: string): string {
  const last = s.charCodeAt(s.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? s.slice(0, -1) : s;
}

/**
 * بریدنِ HTML بی‌شکستنِ تگ یا موجودیت (`&amp;`) و با بستنِ تگ‌های باز.
 * ⚠️ `slice` ِ ساده «<b>عنو…» یا «&am» می‌ساخت و تلگرام کلِ پیام را رد می‌کرد.
 */
export function truncateHtml(html: string, max: number): string {
  if (html.length <= max) return html;
  const stack: string[] = [];
  let out = '';
  for (const m of html.matchAll(TOKEN)) {
    const tok = m[0];
    const room = max - out.length - closers(stack).length - 1;
    if (m[2]) {
      const name = m[2].toLowerCase();
      if (m[1]) {
        const at = stack.map(tagName).lastIndexOf(name);
        if (at < 0) continue;
        out += tok;
        stack.splice(at, 1);
        continue;
      }
      // تگِ باز به‌اضافهٔ بستنش باید جا شود.
      if (tok.length + name.length + 3 > room) break;
      out += tok;
      stack.push(tok);
      continue;
    }
    if (tok.startsWith('&') && tok.length > 1) {
      if (tok.length > room) break;
      out += tok;
      continue;
    }
    if (tok.length <= room) { out += tok; continue; }
    out += dropLoneSurrogate(tok.slice(0, Math.max(0, room)));
    break;
  }
  return `${out.trimEnd()}…${closers(stack)}`;
}

/**
 * HTML ِ بلند ← چند تکه از مرزِ خط. تگی که از یک تکه به تکهٔ بعد می‌رود (مثلاً
 * نقل‌قولِ چندخطی) ته تکه بسته و سرِ تکهٔ بعد دوباره باز می‌شود.
 */
export function splitHtml(html: string, max: number): string[] {
  if (html.length <= max) return [html];
  const budget = Math.max(200, max - 120);
  const out: string[] = [];
  let carry: string[] = [];
  let cur = '';
  const flush = () => {
    if (!cur) return;
    const prefix = carry.join('');
    const end = openTags(cur, carry);
    out.push(`${prefix}${cur}${closers(end)}`);
    carry = end;
    cur = '';
  };
  for (const raw of html.split(NL)) {
    const line = raw.length > budget ? truncateHtml(raw, budget) : raw;
    if (cur && cur.length + line.length + 1 > budget) flush();
    cur = cur ? `${cur}${NL}${line}` : line;
  }
  flush();
  return out;
}

/** HTML ← متنِ ساده؛ برای وقتی تلگرام قالب را نپذیرفت (نسخهٔ پشتیبان). */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** آیا پاسخِ تلگرام می‌گوید قالبِ HTML را نفهمید؟ */
export function isParseError(res: unknown): boolean {
  const r = res as { ok?: boolean; description?: string } | null;
  return Boolean(r && r.ok === false && /pars|entit|tag/i.test(r.description ?? ''));
}

/* ---------------- جوابِ هوشِ مصنوعی ---------------- */

function inlineMd(line: string): string {
  // تکه‌های `کد` جدا؛ بقیه پررنگ و پیوند.
  return line.split('`').map((part, i, all) => {
    if (i % 2 === 1 && i < all.length - 1) return `<code>${esc(part)}</code>`;
    const text = i % 2 === 1 ? `\`${part}` : part;
    return esc(text)
      .replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)"<>]+)\)/g, '<a href="$2">$1</a>');
  }).join('');
}

/**
 * جوابِ هوشِ مصنوعی (معمولاً Markdown) ← HTML ِ تلگرام: «**پررنگ**»، «`کد`»،
 * «```بلوک```»، «# سرتیتر»، «- ردیف» و «[متن](https://…)». ⚠️ همه چیز اول
 * escape می‌شود؛ هیچ تگی از خودِ جواب رد نمی‌شود.
 */
export function mdToHtml(md: string): string {
  const parts = md.split(/```[\w+-]*\n?/);
  return parts.map((part, i) => {
    if (i % 2 === 1) return `<pre>${esc(part.replace(/\n$/, ''))}</pre>`;
    return part.split(NL).map((line) => {
      const h = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (h) return `<b>${inlineMd(h[1]!.replace(/\*\*/g, ''))}</b>`;
      const li = /^(\s*)[-*+]\s+(.*)$/.exec(line);
      if (li) return `${li[1]}• ${inlineMd(li[2]!)}`;
      return inlineMd(line);
    }).join(NL);
  }).join('');
}
