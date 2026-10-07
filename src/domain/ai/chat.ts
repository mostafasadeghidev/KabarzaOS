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
