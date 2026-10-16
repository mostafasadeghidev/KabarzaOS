import { describe, it, expect } from 'vitest';
import { adaptRequest, allow, classifyProviderError, clip, parseArgs, providerErrorText, toOpenAiTools, trimHistory } from './chat';

describe('حلقهٔ گفت‌وگو', () => {
  it('ابزارِ MCP ← تابعِ OpenAI بی $schema', () => {
    const [tool] = toOpenAiTools([{ name: 'log_hours', inputSchema: { $schema: 'x', additionalProperties: false, type: 'object', properties: { a: {} } } }]);
    expect(tool!.function.parameters).toEqual({ type: 'object', properties: { a: {} } });
    expect(toOpenAiTools([{ name: 'whoami' }])[0]!.function.parameters).toEqual({ type: 'object', properties: {} });
  });

  it('آرگومانِ خراب ← شیءِ خالی', () => {
    expect(parseArgs('{"a":1}')).toEqual({ a: 1 });
    expect(parseArgs('nope')).toEqual({});
    expect(parseArgs('[1]')).toEqual({});
    expect(parseArgs(undefined)).toEqual({});
  });

  it('دسته‌بندیِ خطای ارائه‌دهنده', () => {
    expect(classifyProviderError(429, '')).toBe('quota');
    expect(classifyProviderError(402, '')).toBe('quota');
    expect(classifyProviderError(401, '')).toBe('auth');
    expect(classifyProviderError(404, 'No endpoints found that support tool use')).toBe('no_tools');
    expect(classifyProviderError(400, 'Insufficient Balance')).toBe('quota');
    expect(classifyProviderError(500, 'boom')).toBe('other');
  });

  it('حافظه فقط متن نگه می‌دارد', () => {
    const kept = trimHistory([
      { role: 'system', content: 's' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: '1', content: 'r' },
      { role: 'assistant', content: 'a1' },
    ]);
    expect(kept.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('سقفِ پیام در پنجره', () => {
    let state: { start: number; count: number } | undefined;
    for (let i = 0; i < 3; i++) state = allow(state, 1000, 3, 60_000).state;
    expect(allow(state, 2000, 3, 60_000).allowed).toBe(false);
    expect(allow(state, 70_000, 3, 60_000).allowed).toBe(true);
    expect(clip('x'.repeat(10), 5)).toBe('xxxxx…');
  });
});

describe('تطبیقِ درخواست با مدل‌های تازه (۲.۳۲.۰)', () => {
  const base = { model: 'gpt-6-astra', messages: [], max_tokens: 1200, temperature: 0.2 };

  it('max_tokens ← max_completion_tokens (پاسخِ واقعیِ OpenAI)', () => {
    const err = JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", param: 'max_tokens', code: 'unsupported_parameter' } });
    const next = adaptRequest(base, err)!;
    expect(next).not.toHaveProperty('max_tokens');
    expect(next.max_completion_tokens).toBe(4000);
    expect(next.temperature).toBe(0.2);
  });

  it('دمای غیرپیش‌فرض رد شد ← بی‌دما', () => {
    const err = JSON.stringify({ error: { message: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported." } });
    expect(adaptRequest(base, err)).not.toHaveProperty('temperature');
  });

  it('gpt-6: ابزار با reasoning_effort نه ← none (پاسخِ واقعیِ OpenAI)', () => {
    const err = JSON.stringify({ error: { message: "Function tools with reasoning_effort are not supported for gpt-6-astra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'." } });
    expect(adaptRequest({ model: 'gpt-6-astra', max_completion_tokens: 4000 }, err)).toMatchObject({ reasoning_effort: 'none' });
    expect(adaptRequest({ model: 'gpt-6-astra', reasoning_effort: 'none' }, err)).toBeNull();
  });

  it('خطای بی‌ربط ← null (دوباره امتحان نمی‌شود)', () => {
    expect(adaptRequest(base, JSON.stringify({ error: { message: 'The model `x` does not exist' } }))).toBeNull();
    expect(adaptRequest({ model: 'm', max_completion_tokens: 4000 }, "Unsupported parameter: 'max_tokens'")).toBeNull();
  });

  it('متنِ کوتاهِ خطا از بدنهٔ JSON یا خام', () => {
    expect(providerErrorText(JSON.stringify({ error: { message: 'Model not found' } }))).toBe('Model not found');
    expect(providerErrorText(JSON.stringify({ error: 'quota' }))).toBe('quota');
    expect(providerErrorText('  plain\n text ')).toBe('plain text');
  });
});
