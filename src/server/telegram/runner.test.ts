import { describe, it, expect } from 'vitest';
import { botMode } from './runner';

describe('حالتِ ربات', () => {
  it('خودکار: https ← وب‌هوک؛ تولیدِ بی‌https ← پولینگ؛ توسعه ← خاموش', () => {
    expect(botMode({ APP_URL: 'https://team.example.com', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('webhook');
    expect(botMode({ APP_URL: 'http://10.0.0.2:3000', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('polling');
    expect(botMode({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe('off');
    expect(botMode({ TELEGRAM_BOT_MODE: 'off', APP_URL: 'https://x.com', NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe('off');
    expect(botMode({ TELEGRAM_BOT_MODE: 'Polling', NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe('polling');
  });
});
