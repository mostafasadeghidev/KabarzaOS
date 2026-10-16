import { describe, it, expect } from 'vitest';
import { fromResponsesOutput, sanitizeSchema, toResponsesInput, toResponsesTools, wantsResponsesApi } from './responses';

describe('رابطِ Responses ِ OpenAI (۲.۳۲.۰)', () => {
  it('پیام‌ها: سیستم ← developer، فراخوانی و خروجیِ ابزار با call_id', () => {
    const input = toResponsesInput([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search', arguments: '{"q":"x"}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'result' },
    ]);
    expect(input).toEqual([
      { role: 'developer', content: 'sys' },
      { role: 'user', content: 'hi' },
      { type: 'function_call', call_id: 'c1', name: 'search', arguments: '{"q":"x"}' },
      { type: 'function_call_output', call_id: 'c1', output: 'result' },
    ]);
  });

  it('ابزارها: شکلِ تخت', () => {
    expect(toResponsesTools([{ type: 'function', function: { name: 'a', description: 'd', parameters: { type: 'object' } } }]))
      .toEqual([{ type: 'function', name: 'a', description: 'd', parameters: { type: 'object' } }]);
  });

  it('خروجی: متن و فراخوانی‌ها؛ خالی ← null', () => {
    expect(fromResponsesOutput({ output: [
      { type: 'reasoning' },
      { type: 'function_call', call_id: 'k', name: 'create_project', arguments: '{"title":"t"}' },
    ] })).toEqual({ content: null, tool_calls: [{ id: 'k', type: 'function', function: { name: 'create_project', arguments: '{"title":"t"}' } }] });
    expect(fromResponsesOutput({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }] }))
      .toEqual({ content: 'OK' });
    expect(fromResponsesOutput({ output: [{ type: 'reasoning' }] })).toBeNull();
    expect(fromResponsesOutput(null)).toBeNull();
  });

  it('تشخیصِ پیامِ «از /v1/responses استفاده کن» (متنِ واقعیِ OpenAI)', () => {
    expect(wantsResponsesApi("Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.")).toBe(true);
    expect(wantsResponsesApi('Model not found')).toBe(false);
  });

  it('⚠️ الگوی lookaround از شِما حذف می‌شود؛ الگوی ساده می‌ماند', () => {
    const schema = { type: 'object', properties: {
      email: { type: 'string', pattern: "^(?!\.)[^@]+@[^@]+$" },
      code: { type: 'string', pattern: '^[A-Z]{2,5}$' },
      list: { type: 'array', items: { type: 'string', pattern: '(?<=x)y' } },
    } };
    expect(sanitizeSchema(schema)).toEqual({ type: 'object', properties: {
      email: { type: 'string' },
      code: { type: 'string', pattern: '^[A-Z]{2,5}$' },
      list: { type: 'array', items: { type: 'string' } },
    } });
  });
});
