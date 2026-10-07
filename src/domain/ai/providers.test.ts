import { describe, it, expect } from 'vitest';
import { isPrivateAddress, isSafeBaseUrl, keyHint, pickDefaultModel, PROVIDER_IDS, PROVIDERS, shapeModels } from './providers';

describe('ارائه‌دهنده‌ها', () => {
  it('همه https و سازگار با OpenAI', () => {
    for (const id of PROVIDER_IDS) {
      if (id === 'custom') continue;
      expect(isSafeBaseUrl(PROVIDERS[id].baseUrl)).toBe(true);
    }
  });

  it('گاردِ SSRF: فقط https ِ عمومی', () => {
    expect(isSafeBaseUrl('https://api.example.com/v1')).toBe(true);
    for (const bad of [
      'http://api.example.com/v1', 'https://localhost/v1', 'https://127.0.0.1/v1', 'https://10.0.0.5/v1',
      'https://192.168.1.2/v1', 'https://169.254.169.254/latest', 'https://[::1]/v1', 'https://db/v1',
      'https://user:pass@api.example.com', 'https://printer.local/v1', 'ftp://x.com', 'not a url',
    ]) expect(isSafeBaseUrl(bad), bad).toBe(false);
  });

  it('IP ِ خصوصی', () => {
    expect(isPrivateAddress('172.20.0.1')).toBe(true);
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('api.openai.com')).toBe(false);
  });

  it('فقط چهار نویسهٔ آخرِ کلید', () => {
    expect(keyHint('sk-abcdefghijkl')).toBe('…ijkl');
    expect(keyHint('short')).toBe('');
  });

  it('فهرستِ مدل: رایگانِ ابزارپذیر اول؛ پیشوندِ Gemini حذف', () => {
    const models = shapeModels({ data: [
      { id: 'paid', pricing: { prompt: '0.001', completion: '0.002' }, supported_parameters: ['tools'] },
      { id: 'free-chat:free', supported_parameters: [] },
      { id: 'free-tools:free', supported_parameters: ['tools'] },
      { id: 'models/gemini-2.5-flash' },
      { name: 'بی‌شناسه' },
    ] });
    expect(models.map((m) => m.id)).toEqual(['free-tools:free', 'free-chat:free', 'gemini-2.5-flash', 'paid']);
    expect(pickDefaultModel(models)).toBe('free-tools:free');
    expect(pickDefaultModel([])).toBe('');
  });
});
