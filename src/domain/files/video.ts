/**
 * پیوندِ ویدئو و متنِ پیوند‌دار — تصمیم‌های خالص، بدونِ I/O.
 *
 * ⚠️ امنیت: آدرسِ iframe هرگز از خودِ متنِ کاربر ساخته نمی‌شود. فقط شناسهٔ
 * ویدئو (با الگوی سفید) بیرون کشیده می‌شود و آدرس روی دامنهٔ ثابتِ همان
 * سرویس از نو ساخته می‌شود؛ پس پیوندِ دست‌کاری‌شده نمی‌تواند صفحهٔ دلخواهی
 * را داخلِ برنامه قاب کند.
 */

export type VideoProvider = 'loom' | 'youtube' | 'vimeo';

export interface VideoLink {
  provider: VideoProvider;
  id: string;
  /** کلیدِ ثانویهٔ ویدئوی خصوصیِ ویمئو (`h`) — بی‌آن ویدئوی unlisted پخش نمی‌شود. */
  hash: string | null;
  /** ثانیهٔ شروع اگر پیوند داشت (`?t=`). */
  start: number | null;
}

const LOOM_ID = /^[0-9a-f]{32}$/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;

function safeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
}

/** پیوندِ ویدئوی پشتیبانی‌شده را می‌شناسد؛ هر چیزِ دیگر `null`. */
export function parseVideoUrl(raw: string): VideoLink | null {
  const url = safeUrl(raw);
  if (!url) return null;
  const host = hostOf(url);
  const parts = url.pathname.split('/').filter(Boolean);
  const start = parseTimestamp(url.searchParams.get('t') ?? url.searchParams.get('start') ?? '');

  if (host === 'loom.com') {
    // share/{id} و embed/{id}؛ گاهی عنوانِ ویدئو با خط تیره پیش از شناسه می‌آید.
    if (parts[0] !== 'share' && parts[0] !== 'embed') return null;
    const id = (parts[1] ?? '').split('-').pop() ?? '';
    return LOOM_ID.test(id) ? { provider: 'loom', id: id.toLowerCase(), hash: null, start } : null;
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = parts[0] === 'watch' ? (url.searchParams.get('v') ?? '')
      : ['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '') ? (parts[1] ?? '')
        : '';
    return YOUTUBE_ID.test(id) ? { provider: 'youtube', id, hash: null, start } : null;
  }
  if (host === 'youtu.be') {
    const id = parts[0] ?? '';
    return YOUTUBE_ID.test(id) ? { provider: 'youtube', id, hash: null, start } : null;
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const rest = parts[0] === 'video' ? parts.slice(1) : parts;
    const id = rest[0] ?? '';
    if (!VIMEO_ID.test(id)) return null;
    const hash = url.searchParams.get('h') ?? rest[1] ?? null;
    // زمان در ویمئو در هش می‌آید: `#t=1m20s`
    const fragment = /(?:^|&)t=([^&]+)/.exec(url.hash.replace(/^#/, ''))?.[1] ?? '';
    return {
      provider: 'vimeo',
      id,
      hash: hash && VIMEO_HASH.test(hash) ? hash : null,
      start: start ?? parseTimestamp(fragment),
    };
  }
  return null;
}

/**
 * آدرسِ پخش‌کنندهٔ قاب‌شده — با شروع از ثانیهٔ دلخواه.
 * `autoplay` فقط وقتی کاربر خودش روی زمانی کلیک کرده (پرش)، نه در بارِ اول.
 */
export function embedUrl(video: VideoLink, at: number | null = video.start, autoplay = false): string {
  const seconds = at !== null && at > 0 ? Math.floor(at) : null;
  switch (video.provider) {
    case 'loom': {
      const q = new URLSearchParams({ hide_owner: 'true', hide_share: 'true', hideEmbedTopBar: 'true' });
      if (seconds !== null) q.set('t', String(seconds));
      if (autoplay) q.set('autoplay', '1');
      return `https://www.loom.com/embed/${video.id}?${q}`;
    }
    case 'youtube': {
      const q = new URLSearchParams({ rel: '0' });
      if (seconds !== null) q.set('start', String(seconds));
      if (autoplay) q.set('autoplay', '1');
      return `https://www.youtube-nocookie.com/embed/${video.id}?${q}`;
    }
    case 'vimeo': {
      const q = new URLSearchParams();
      if (video.hash) q.set('h', video.hash);
      if (autoplay) q.set('autoplay', '1');
      const query = q.toString();
      return `https://player.vimeo.com/video/${video.id}${query ? `?${query}` : ''}${seconds !== null ? `#t=${seconds}s` : ''}`;
    }
  }
}

/** نامِ نمایشیِ سرویس. */
export const PROVIDER_LABEL: Record<VideoProvider, string> = {
  loom: 'Loom',
  youtube: 'YouTube',
  vimeo: 'Vimeo',
};

/* ------------------------------------------------------------------ *
 * زمانِ ویدئو
 * ------------------------------------------------------------------ */

/**
 * «۱:۲۳»، «01:02:03»، «83»، «1m20s» یا «83s» ← ثانیه. ورودیِ نامعتبر `null`.
 * ⚠️ رقمِ فارسی و عربی هم پذیرفته می‌شود — کاربر روی صفحه‌کلیدِ فارسی تایپ می‌کند.
 */
export function parseTimestamp(raw: string): number | null {
  const text = toLatinDigits(raw).trim().toLowerCase();
  if (text === '') return null;
  if (/^\d+$/.test(text)) return Number(text);
  const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (units && (units[1] || units[2] || units[3])) {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
  }
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/.exec(text);
  if (clock) {
    const [h, m, s] = [Number(clock[1] ?? 0), Number(clock[2]), Number(clock[3])];
    if (s >= 60 || (clock[1] !== undefined && m >= 60)) return null;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

/** ثانیه ← «m:ss» یا «h:mm:ss». */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function toLatinDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/* ------------------------------------------------------------------ *
 * متنِ پیوند‌دار
 * ------------------------------------------------------------------ */

export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; href: string; text: string };

/** آدرس تا اولین فاصله یا گیومه/پرانتزِ زاویه‌ای. */
const URL_PATTERN = /https?:\/\/[^\s<>"'«»]+/gi;
/** نشانه‌گذاریِ پایانِ جمله جزوِ آدرس نیست. */
const TRAILING = /[.,;:!?،؛…)\]}]+$/;

/**
 * متن را به تکه‌های «متن» و «پیوند» می‌شکند. فقط http/https.
 * ⚠️ خروجی رشتهٔ خام است و نمایش‌دهنده آن را مثلِ متن رندر می‌کند — هیچ
 * HTML ای ساخته نمی‌شود.
 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    let href = match[0];
    const index = match.index ?? 0;
    // پرانتزِ بسته فقط وقتی جزوِ آدرس است که بازش هم در آدرس باشد (ویکی‌پدیا).
    const trail = TRAILING.exec(href)?.[0] ?? '';
    if (trail) {
      let keep = '';
      if (trail.startsWith(')') && href.includes('(')) keep = ')';
      href = href.slice(0, href.length - trail.length) + keep;
    }
    if (!safeUrl(href)) continue;
    if (index > last) parts.push({ kind: 'text', text: text.slice(last, index) });
    parts.push({ kind: 'link', href, text: href });
    last = index + href.length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/** ویدئوهای یک متن — بی‌تکرار، به ترتیبِ آمدن، حداکثر `limit` تا. */
export function videosIn(text: string, limit = 3): Array<VideoLink & { href: string }> {
  const seen = new Set<string>();
  const out: Array<VideoLink & { href: string }> = [];
  for (const part of linkify(text)) {
    if (part.kind !== 'link') continue;
    const video = parseVideoUrl(part.href);
    if (!video) continue;
    const key = `${video.provider}:${video.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...video, href: part.href });
    if (out.length >= limit) break;
  }
  return out;
}
