import type { ChatMessage, ToolCall } from './chat';

/**
 * رابطِ «Responses» ِ OpenAI (`/v1/responses`) — ۲.۳۲.۰.
 *
 * ⚠️ چرا: مدل‌های تازهٔ OpenAI (مثلاً gpt-6-astra) در `chat/completions` ابزار را
 * فقط با `reasoning_effort: none` می‌پذیرند و خودشان `none` را رد می‌کنند؛ یعنی
 * ربات با آن‌ها فقط از این رابط کار می‌کند. حلقهٔ ربات همان شکلِ پیامِ
 * chat/completions را نگه می‌دارد و اینجا فقط ترجمه می‌شود.
 */

type ChatTool = { type: 'function'; function: { name: string; description?: string; parameters?: unknown } };

/**
 * ⚠️ رابطِ Responses الگوی regex با lookaround (`(?=`، `(?!`، `(?<`) را در شِمای
 * ابزار نمی‌پذیرد و **کلِ** درخواست را رد می‌کند (ابزارِ ایمیلِ عضو چنین الگویی
 * دارد). اعتبارسنجیِ واقعی در سرورِ MCP است، پس اینجا فقط همان الگو کنار می‌رود.
 */
export function sanitizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'pattern' && typeof value === 'string' && /\(\?[=!<]/.test(value)) continue;
    out[key] = sanitizeSchema(value);
  }
  return out;
}

export function toResponsesTools(tools: readonly ChatTool[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    name: t.function.name,
    description: t.function.description ?? t.function.name,
    parameters: sanitizeSchema(t.function.parameters ?? { type: 'object', properties: {} }),
  }));
}

export function toResponsesInput(messages: readonly ChatMessage[]): unknown[] {
  const input: unknown[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      input.push({ role: 'developer', content: m.content });
    } else if (m.role === 'user') {
      // تصویر در Responses «input_image» است، نه «image_url» (۲.۳۴.۰).
      input.push({
        role: 'user',
        content: typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text'
          ? { type: 'input_text', text: p.text }
          : { type: 'input_image', image_url: p.image_url.url })),
      });
    } else if (m.role === 'assistant') {
      if (m.content) input.push({ role: 'assistant', content: m.content });
      for (const c of m.tool_calls ?? []) {
        input.push({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments });
      }
    } else if (m.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: m.tool_call_id, output: m.content });
    }
  }
  return input;
}

interface ResponsesOutputItem {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
  call_id?: string;
  name?: string;
  arguments?: string;
}

/** خروجیِ Responses ← همان شکلِ پیامِ chat/completions؛ بی‌متن و بی‌ابزار ← null. */
export function fromResponsesOutput(data: { output?: ResponsesOutputItem[] } | null):
  { content: string | null; tool_calls?: ToolCall[] } | null {
  const output = data?.output;
  if (!Array.isArray(output)) return null;
  const text = output
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text!)
    .join('');
  const calls: ToolCall[] = output
    .filter((o) => o.type === 'function_call' && o.name && o.call_id)
    .map((o) => ({ id: o.call_id!, type: 'function' as const, function: { name: o.name!, arguments: o.arguments ?? '{}' } }));
  if (!text && calls.length === 0) return null;
  return { content: text || null, ...(calls.length > 0 ? { tool_calls: calls } : {}) };
}

/** خطای chat/completions که می‌گوید «از /v1/responses استفاده کن». */
export function wantsResponsesApi(errorBody: string): boolean {
  return /\/v1\/responses/.test(errorBody);
}
