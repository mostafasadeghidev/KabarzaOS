import { describe, it, expect } from 'vitest';
import { allow, classifyProviderError, clip, parseArgs, toOpenAiTools, trimHistory } from './chat';

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
