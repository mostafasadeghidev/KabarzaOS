import { describe, it, expect } from 'vitest';
import {
  isValidBotToken, isValidBotUsername, normalizeTelegram, resolveTelegram, EMPTY_TELEGRAM,
} from './telegram';

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

describe('bot token', () => {
  it('accepts the real shape and rejects near-misses', () => {
    expect(isValidBotToken(TOKEN)).toBe(true);
    for (const bad of ['', 'abc', '123:short', ':nodigits', TOKEN.replace(':', '')]) {
      expect(isValidBotToken(bad), bad).toBe(false);
    }
  });
});

describe('bot username', () => {
  it('accepts plain names, rejects malformed ones', () => {
    for (const ok of ['kabarza_bot', 'TeamBot', 'a_b_c1']) {
      expect(isValidBotUsername(ok), ok).toBe(true);
    }
    for (const bad of ['', 'ab', '1bot', 'has space', 'trailing_']) {
      expect(isValidBotUsername(bad), bad).toBe(false);
    }
  });
});

describe('normalize', () => {
  it('strips the @ people copy from Telegram', () => {
    expect(normalizeTelegram({ token: TOKEN, username: '@kabarza_bot' }))
      .toEqual({ token: TOKEN, username: 'kabarza_bot' });
  });

  it('drops invalid values instead of storing them', () => {
    expect(normalizeTelegram({ token: 'nope', username: 'x' })).toEqual(EMPTY_TELEGRAM);
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeTelegram({ token: `  ${TOKEN}  `, username: ' bot_name ' }).token).toBe(TOKEN);
  });
});

describe('resolve', () => {
  const stored = { token: 'stored:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', username: 'stored_bot' };

  it('environment wins when it has a token', () => {
    expect(resolveTelegram({ token: TOKEN, username: 'env_bot' }, stored))
      .toEqual({ token: TOKEN, username: 'env_bot' });
  });

  it('falls back to the stored pair when the environment is empty', () => {
    expect(resolveTelegram({}, stored)).toEqual(stored);
    expect(resolveTelegram({ token: '   ' }, stored)).toEqual(stored);
  });

  /**
   * ⚠️ The pair must not be mixed. A stored token with an environment
   * username builds a connect link for one bot while another sends the
   * messages, and the link silently does nothing.
   */
  it('never mixes a stored token with an environment username', () => {
    expect(resolveTelegram({ username: 'env_bot' }, stored).username).toBe('stored_bot');
    expect(resolveTelegram({ token: TOKEN }, stored).username).toBe('');
  });
});
