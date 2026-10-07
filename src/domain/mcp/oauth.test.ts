import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isAllowedRedirect, parseScopes, redirectMatches, verifyPkce } from './oauth';

const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const challenge = createHash('sha256').update(verifier).digest('base64url');

describe('PKCE', () => {
  it('نمونهٔ RFC 7636', () => {
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });
  it('verifier ِ نادرست یا کوتاه رد می‌شود', () => {
    expect(verifyPkce(verifier.replace('d', 'e'), challenge)).toBe(false);
    expect(verifyPkce('short', challenge)).toBe(false);
    expect(verifyPkce(verifier, '')).toBe(false);
  });
});

describe('نشانیِ بازگشت', () => {
  it('https، loopback و طرحِ برنامه پذیرفته؛ خطرناک‌ها نه', () => {
    expect(isAllowedRedirect('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isAllowedRedirect('http://localhost:33418/callback')).toBe(true);
    expect(isAllowedRedirect('http://127.0.0.1:5000/cb')).toBe(true);
    expect(isAllowedRedirect('cursor://anysphere.cursor-retrieval/oauth/callback')).toBe(true);
    expect(isAllowedRedirect('http://evil.example/cb')).toBe(false);
    expect(isAllowedRedirect('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirect('https://claude.ai/cb#frag')).toBe(false);
    expect(isAllowedRedirect('not a url')).toBe(false);
  });
  it('تطابقِ دقیق؛ فقط پورتِ loopback آزاد', () => {
    const reg = ['https://claude.ai/cb', 'http://127.0.0.1:1234/callback'];
    expect(redirectMatches('https://claude.ai/cb', reg)).toBe(true);
    expect(redirectMatches('https://claude.ai/cb2', reg)).toBe(false);
    expect(redirectMatches('http://127.0.0.1:9999/callback', reg)).toBe(true);
    expect(redirectMatches('http://127.0.0.1:9999/other', reg)).toBe(false);
  });
});

describe('دامنه', () => {
  it('فقط read/write؛ خالی یعنی هر دو', () => {
    expect(parseScopes('read')).toEqual(['read']);
    expect(parseScopes('read write admin')).toEqual(['read', 'write']);
    expect(parseScopes('')).toEqual(['read', 'write']);
    expect(parseScopes('openid profile')).toEqual(['read', 'write']);
  });
});
