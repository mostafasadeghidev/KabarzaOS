/**
 * ارائه‌دهنده‌های هوشِ مصنوعی برای «مغزِ» ربات تلگرام (۲.۹.۰).
 *
 * ⚠️ همه از راهِ **رابطِ سازگار با OpenAI** (`/chat/completions` + `/models`)
 * صدا زده می‌شوند؛ پس افزودنِ ارائه‌دهندهٔ تازه فقط یک ردیفِ اینجاست، نه کدِ
 * جدا. هر سرویسی که این رابط را دارد با «نشانیِ دلخواه» هم وصل می‌شود.
 *
 * ⚠️ کلید و هزینه مالِ خودِ کاربر است؛ شرکت هیچ کلیدِ مشترکی نمی‌گذارد.
 */

export const PROVIDER_IDS = [
  'openrouter', 'deepseek', 'openai', 'anthropic', 'zai', 'agentrouter', 'gemini', 'groq', 'custom',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderPreset {
  id: ProviderId;
  /** نامِ تجاری — ترجمه نمی‌شود. */
  label: string;
  /** نشانیِ پایهٔ رابطِ سازگار با OpenAI؛ برای `custom` خالی. */
  baseUrl: string;
  /** مدلِ پیش‌فرض؛ خالی = از فهرستِ `/models` انتخاب شود. */
  defaultModel: string;
  /** صفحه‌ای که کاربر کلیدش را آنجا می‌سازد. */
  keyUrl: string;
  /** مدلِ رایگان یا سهمیهٔ رایگان دارد. */
  free: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderPreset> = {
  openrouter: {
    id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '', keyUrl: 'https://openrouter.ai/keys', free: true,
  },
  deepseek: {
    id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys', free: false,
  },
  openai: {
    id: 'openai', label: 'ChatGPT (OpenAI)', baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys', free: false,
  },
  anthropic: {
    id: 'anthropic', label: 'Claude (Anthropic)', baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-haiku-4-5', keyUrl: 'https://console.anthropic.com/settings/keys', free: false,
  },
  zai: {
    id: 'zai', label: 'Z.ai (GLM)', baseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-4.5-flash', keyUrl: 'https://z.ai/manage-apikey/apikey-list', free: true,
  },
  agentrouter: {
    id: 'agentrouter', label: 'AgentRouter', baseUrl: 'https://agentrouter.org/v1',
    defaultModel: '', keyUrl: 'https://agentrouter.org/console/token', free: true,
  },
  gemini: {
    id: 'gemini', label: 'Gemini (Google)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey', free: true,
  },
  groq: {
    id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys', free: true,
  },
  custom: {
    id: 'custom', label: 'OpenAI-compatible', baseUrl: '',
    defaultModel: '', keyUrl: '', free: false,
  },
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * سرآیندهای احراز برای یک ارائه‌دهنده. Anthropic در رابطِ سازگارش Bearer را
 * می‌پذیرد ولی `/models` ِ خودش `x-api-key` می‌خواهد؛ هر دو فرستاده می‌شوند.
 */
export function authHeaders(provider: ProviderId, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }
  return headers;
}

/** چهار نویسهٔ آخرِ کلید برای تشخیص — هرگز بیشتر. */
export function keyHint(apiKey: string): string {
  const k = apiKey.trim();
  return k.length > 8 ? `…${k.slice(-4)}` : '';
}

/**
 * نشانیِ دلخواه امن است؟ ⚠️ بی این گارد، «نشانیِ دلخواه» راهی می‌شد که کاربر
 * سرور را وادار کند به شبکهٔ داخلی (دیتابیس، متادیتای ابر، …) درخواست بزند
 * (SSRF). فقط HTTPS به میزبانِ عمومی؛ IP ِ خصوصی/محلی و نام‌های داخلی رد.
 * (تفکیکِ DNS به IP ِ داخلی جدا در سرور بررسی می‌شود.)
 */
export function isSafeBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) return false;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) return false;
  return !isPrivateAddress(host);
}

/** IP ِ خصوصی، محلی، پیوندی یا رزرو؟ (نام‌دامنه = false) */
export function isPrivateAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(':')) {
    if (h === '::' || h === '::1') return true;
    if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true;
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return false;
  }
  return false;
}

/** نشانیِ پایه بی `/` ِ پایانی. */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/** ردیفِ فهرستِ `/models` ِ سازگار با OpenAI (و فیلدهای اضافهٔ OpenRouter). */
export interface RawModel {
  id?: unknown;
  name?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  supported_parameters?: unknown;
}

export interface ModelOption {
  id: string;
  name: string;
  free: boolean;
  tools: boolean | null;
}

/**
 * فهرستِ مدل‌ها ← گزینه‌ها: رایگان‌ها و ابزارپذیرها اول. `tools` فقط وقتی
 * معلوم است که ارائه‌دهنده گفته باشد (OpenRouter)؛ بقیه null.
 */
export function shapeModels(raw: unknown): ModelOption[] {
  const list = Array.isArray((raw as { data?: unknown })?.data)
    ? (raw as { data: RawModel[] }).data
    : Array.isArray(raw) ? (raw as RawModel[]) : [];
  const out: ModelOption[] = [];
  for (const m of list) {
    if (typeof m?.id !== 'string' || m.id === '') continue;
    const free = m.id.endsWith(':free')
      || (m.pricing !== undefined && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0);
    const params = Array.isArray(m.supported_parameters) ? m.supported_parameters as unknown[] : null;
    out.push({
      // Gemini پیشوندِ `models/` می‌دهد ولی بی‌آن صدا زده می‌شود.
      id: m.id.replace(/^models\//, ''),
      name: typeof m.name === 'string' && m.name ? m.name : m.id.replace(/^models\//, ''),
      free,
      tools: params ? params.includes('tools') : null,
    });
  }
  const rank = (m: ModelOption) => (m.free ? 0 : 2) + (m.tools === false ? 1 : 0);
  return out.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)).slice(0, 400);
}

/** بهترین مدلِ پیش‌فرض: رایگان + ابزارپذیر، وگرنه اولین. */
export function pickDefaultModel(models: ModelOption[]): string {
  return (models.find((m) => m.free && m.tools === true) ?? models.find((m) => m.free) ?? models[0])?.id ?? '';
}
