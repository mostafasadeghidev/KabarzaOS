import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dropStill, frameGap, isLoomMediaUrl, MAX_FRAMES, MAX_VIDEO_SECONDS } from '@/domain/ai/media';

/**
 * بیرون‌کشیدنِ صدا و عکس از ویدیو با ffmpeg (۲.۳۴.۰).
 *
 * ⚠️ ffmpeg در ایمیجِ تولید نصب است (Dockerfile). روی ماشینی که ندارد، ویدیو فقط
 * از راهِ صدا فهمیده می‌شود (Whisper خودِ mp4 را هم می‌پذیرد) و عکسی در کار نیست.
 * ⚠️ همه چیز در پوشهٔ موقت و در `finally` پاک می‌شود؛ ویدیو جایی نگه داشته نمی‌شود.
 */

const RUN_TIMEOUT_MS = 5 * 60_000;

function run(cmd: string, args: string[], timeoutMs = RUN_TIMEOUT_MS): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch {
      resolve({ code: null, out: '' });
      return;
    }
    const keep = (b: Buffer) => { if (out.length < 64_000) out += b.toString(); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', () => { clearTimeout(timer); resolve({ code: null, out }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

let ffmpegReady: Promise<boolean> | null = null;
export function ffmpegAvailable(): Promise<boolean> {
  ffmpegReady ??= run('ffmpeg', ['-version'], 10_000).then((r) => r.code === 0);
  return ffmpegReady;
}

/** پروتکل‌های مجازِ ورودیِ ffmpeg برای نشانیِ Loom — نه file، نه http ِ بی‌رمز. */
const URL_WHITELIST = ['-protocol_whitelist', 'https,tls,tcp,crypto,hls'];

export interface ExtractedVideo {
  duration: number;
  truncated: boolean;
  /** صدای فشرده (mp3 ِ تک‌کاناله) یا null اگر ویدیو صدا نداشت. */
  audio: Blob | null;
  frames: Array<{ t: number; jpeg: Buffer }>;
}

/**
 * ورودی: مسیرِ فایلِ موقت یا نشانیِ HTTPS (Loom). یک بار خواندن، دو خروجی:
 * صدا برای متن و عکس هر چند ثانیه. ⚠️ نشانیِ دلخواه پذیرفته نمی‌شود — فقط Loom.
 */
export interface VideoLimits {
  /** سقفِ ثانیه (تنظیمات)؛ بیشتر از آن کوتاه می‌شود. */
  maxSeconds: number;
  maxFrames: number;
}

const DEFAULT_LIMITS: VideoLimits = { maxSeconds: MAX_VIDEO_SECONDS, maxFrames: MAX_FRAMES };

export async function extractVideo(input: string, limits: VideoLimits = DEFAULT_LIMITS): Promise<ExtractedVideo | null> {
  const remote = /^https:\/\//.test(input);
  if (remote && !isLoomMediaUrl(input)) return null;
  if (!(await ffmpegAvailable())) return null;
  const pre = remote ? URL_WHITELIST : [];

  const probe = await run('ffprobe', [
    '-v', 'error', ...pre, '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', input,
  ], 60_000);
  if (probe.code !== 0) return null;
  let info: { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
  try { info = JSON.parse(probe.out); } catch { return null; }
  const full = Number(info.format?.duration ?? 0) || 0;
  const hasAudio = info.streams?.some((s) => s.codec_type === 'audio') ?? false;
  const hasVideo = info.streams?.some((s) => s.codec_type === 'video') ?? false;
  if (!hasAudio && !hasVideo) return null;
  const duration = Math.min(full || limits.maxSeconds, limits.maxSeconds);
  const gap = frameGap(duration, limits.maxFrames);
  // ویدیوی یک‌ساعته دانلود و رمزگشایی می‌خواهد؛ سقفِ زمان با طولِ ویدیو بالا می‌رود.
  const timeout = Math.max(RUN_TIMEOUT_MS, duration * 500);

  const dir = await mkdtemp(join(tmpdir(), 'kbz-video-'));
  try {
    const args = ['-hide_banner', '-loglevel', 'error', '-y', ...pre, '-i', input, '-t', String(Math.ceil(duration))];
    if (hasAudio) args.push('-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', join(dir, 'audio.mp3'));
    if (hasVideo) {
      args.push('-map', '0:v:0', '-an', '-vf', `fps=1/${gap},scale='min(1280,iw)':-2`, '-q:v', '5',
        '-frames:v', String(limits.maxFrames + 2), join(dir, 'f_%03d.jpg'));
    }
    const res = await run('ffmpeg', args, timeout);
    if (res.code !== 0) {
      console.error('[ai] ffmpeg', res.out.slice(0, 300));
      return null;
    }
    let audio: Blob | null = null;
    if (hasAudio) {
      const bytes = await readFile(join(dir, 'audio.mp3')).catch(() => null);
      if (bytes && bytes.length > 0) audio = new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' });
    }
    const names = (await readdir(dir)).filter((n) => n.startsWith('f_')).sort();
    const raw = await Promise.all(names.map(async (name, i) => {
      const path = join(dir, name);
      return { t: i * gap, size: (await stat(path)).size, path };
    }));
    const kept = dropStill(raw).slice(0, limits.maxFrames);
    const frames = await Promise.all(kept.map(async (f) => ({ t: f.t, jpeg: await readFile(f.path) })));
    return { duration: full || duration, truncated: full > limits.maxSeconds, audio, frames };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** همان کار برای بایت‌های فایلِ تلگرام — در فایلِ موقت نوشته و بعد پاک می‌شود. */
export async function extractVideoBytes(bytes: Uint8Array, ext = 'mp4', limits: VideoLimits = DEFAULT_LIMITS): Promise<ExtractedVideo | null> {
  if (!(await ffmpegAvailable())) return null;
  const dir = await mkdtemp(join(tmpdir(), 'kbz-upload-'));
  try {
    const path = join(dir, `input.${ext.replace(/[^a-z0-9]/gi, '') || 'mp4'}`);
    await writeFile(path, bytes);
    return await extractVideo(path, limits);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ---------------- Loom ---------------- */

export interface LoomVideo { title: string; duration: number; mediaUrl: string }

/**
 * لینکِ اشتراکِ Loom ← نشانیِ فایلِ ویدیو. ⚠️ رابطِ رسمی نیست (همان که پخش‌کنندهٔ
 * خودِ Loom صدا می‌زند)؛ اگر Loom عوضش کند، ربات صریح می‌گوید «فایل را بفرستید».
 * ویدیوی خصوصی (فقط اعضای فضای کاریِ Loom) هم همین‌جا null می‌شود.
 */
export async function loomVideo(id: string): Promise<LoomVideo | null> {
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  const share = `https://www.loom.com/share/${id}`;
  const meta = await fetch(`https://www.loom.com/v1/oembed?url=${encodeURIComponent(share)}`, {
    signal: AbortSignal.timeout(20_000), redirect: 'error',
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { title?: unknown; duration?: unknown } | null;
  for (const kind of ['transcoded-url', 'raw-url']) {
    const res = await fetch(`https://www.loom.com/api/campaigns/sessions/${id}/${kind}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      signal: AbortSignal.timeout(20_000), redirect: 'error',
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { url?: unknown } | null;
    const url = typeof res?.url === 'string' ? res.url : '';
    if (url && isLoomMediaUrl(url)) {
      return {
        title: typeof meta?.title === 'string' ? meta.title.slice(0, 200) : '',
        duration: typeof meta?.duration === 'number' ? meta.duration : 0,
        mediaUrl: url,
      };
    }
  }
  return null;
}

/**
 * بی ffmpeg: فایلِ Loom ِ کوچک مستقیم دانلود می‌شود تا دستِ‌کم صدایش فهمیده شود.
 * ⚠️ فقط تا سقفِ صدای Whisper؛ بزرگ‌تر ← null.
 */
export async function downloadSmall(url: string, maxBytes: number): Promise<Blob | null> {
  if (!isLoomMediaUrl(url)) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: 'error' }).catch(() => null);
  if (!res?.ok) return null;
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > maxBytes) return null;
  const blob = await res.blob();
  return blob.size > 0 && blob.size <= maxBytes ? blob : null;
}
