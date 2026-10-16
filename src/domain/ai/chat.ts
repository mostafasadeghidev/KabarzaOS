/**
 * تکه‌های خالصِ حلقهٔ گفت‌وگوی ربات (۲.۹.۰) — بی شبکه و دیتابیس، برای تست.
 */

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/** ابزارِ MCP ← ابزارِ «تابع» ِ رابطِ OpenAI. */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
}

export function toOpenAiTools(tools: McpToolInfo[]) {
  return tools.map((tool) => {
    // `$schema` و `additionalProperties` را بعضی ارائه‌دهنده‌ها (Gemini) نمی‌پذیرند.
    const { $schema: _s, additionalProperties: _a, ...schema } = tool.inputSchema ?? {};
    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description ?? tool.name,
        parameters: Object.keys(schema).length > 0 ? schema : { type: 'object', properties: {} },
      },
    };
  });
}

/** آرگومانِ JSON ِ مدل ← شیء؛ متنِ خراب ← شیءِ خالی. */
export function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** پاسخِ خطای ارائه‌دهنده ← نوع: سهمیه، کلید، نپذیرفتنِ ابزار، یا خطای دیگر. */
export function classifyProviderError(status: number, body: string): 'quota' | 'auth' | 'no_tools' | 'other' {
  if (status === 429 || status === 402) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  if ((status === 400 || status === 404 || status === 422) && /tool|function/i.test(body)) return 'no_tools';
  if (/quota|rate.?limit|insufficient|credit|balance/i.test(body)) return 'quota';
  return 'other';
}

/**
 * تطبیقِ درخواست با مدل (۲.۳۲.۰). مدل‌های تازهٔ OpenAI (سری‌های o، gpt-5 و gpt-6)
 * `max_tokens` را نمی‌پذیرند و `max_completion_tokens` می‌خواهند، و بعضی هم دمای
 * غیرپیش‌فرض را رد می‌کنند. پیش از این همان خطای ۴۰۰ «پاسخ نداد» می‌شد.
 * از روی متنِ خطا بدنهٔ تازه می‌سازد؛ چیزی برای عوض‌کردن نبود ← null.
 * ⚠️ سقفِ تازه بزرگ‌تر است: در این مدل‌ها توکن‌های «فکرکردن» هم از همین سقف کم می‌شود.
 */
export function adaptRequest(body: Record<string, unknown>, errorBody: string): Record<string, unknown> | null {
  const next = { ...body };
  let changed = false;
  if ('max_tokens' in next && /max_tokens/.test(errorBody) && /max_completion_tokens|unsupported/i.test(errorBody)) {
    delete next.max_tokens;
    next.max_completion_tokens = 4000;
    changed = true;
  }
  if ('temperature' in next && /temperature/.test(errorBody) && /unsupported|not support|only the default/i.test(errorBody)) {
    delete next.temperature;
    changed = true;
  }
  // gpt-6 در chat/completions ابزار را فقط با `reasoning_effort: none` می‌پذیرد (پاسخِ واقعیِ OpenAI).
  if (next.reasoning_effort !== 'none' && /reasoning_effort/.test(errorBody) && /'none'|"none"|none/.test(errorBody)) {
    next.reasoning_effort = 'none';
    changed = true;
  }
  return changed ? next : null;
}

/** پیامِ خطای ارائه‌دهنده برای نمایش و لاگ — فقط متنِ کوتاه، نه کلِ بدنه. */
export function providerErrorText(errorBody: string): string {
  try {
    const parsed = JSON.parse(errorBody) as { error?: { message?: string } | string; message?: string };
    const m = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message;
    if (m) return m.slice(0, 200);
  } catch { /* متنِ خام */ }
  return errorBody.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** پیامِ تلگرام حداکثر ۴۰۹۶ نویسه است. */
export function clip(text: string, max = 3900): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** آخرین n پیامِ متنی — حافظهٔ کوتاهِ گفت‌وگو؛ ردیف‌های ابزار نگه داشته نمی‌شوند. */
export function trimHistory(messages: ChatMessage[], keep = 12): ChatMessage[] {
  const plain = messages.filter((m) =>
    m.role === 'user' || (m.role === 'assistant' && !m.tool_calls?.length && typeof m.content === 'string' && m.content !== ''));
  return plain.slice(-keep);
}

/** پنجرهٔ ساده‌ی شمارش — n درخواست در هر پنجره. */
export function allow(
  state: { start: number; count: number } | undefined,
  now: number,
  limit: number,
  windowMs: number,
): { allowed: boolean; state: { start: number; count: number } } {
  if (!state || now - state.start >= windowMs) return { allowed: true, state: { start: now, count: 1 } };
  if (state.count >= limit) return { allowed: false, state };
  return { allowed: true, state: { start: state.start, count: state.count + 1 } };
}
