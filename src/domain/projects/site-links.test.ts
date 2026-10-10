import { describe, expect, it } from 'vitest';
import { normalizeSiteUrl, siteHost, SITE_URL_MAX } from './site-links';

describe('normalizeSiteUrl', () => {
  it('adds https when the scheme is missing', () => {
    expect(normalizeSiteUrl('example.com')).toBe('https://example.com/');
    expect(normalizeSiteUrl('  example.com/path  ')).toBe('https://example.com/path');
  });

  it('keeps a full webflow.io address', () => {
    expect(normalizeSiteUrl('https://client-x.webflow.io/')).toBe('https://client-x.webflow.io/');
    expect(normalizeSiteUrl('http://client-x.webflow.io')).toBe('http://client-x.webflow.io/');
  });

  it('rejects empty, unsafe and incomplete input', () => {
    expect(normalizeSiteUrl('')).toBeNull();
    expect(normalizeSiteUrl('   ')).toBeNull();
    expect(normalizeSiteUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeSiteUrl('data:text/html,hi')).toBeNull();
    expect(normalizeSiteUrl('ftp://example.com')).toBeNull();
    expect(normalizeSiteUrl('localhost')).toBeNull();
    expect(normalizeSiteUrl('abc')).toBeNull();
    expect(normalizeSiteUrl('https://.com')).toBeNull();
  });

  it('rejects overly long input', () => {
    expect(normalizeSiteUrl(`example.com/${'a'.repeat(SITE_URL_MAX)}`)).toBeNull();
  });
});

describe('siteHost', () => {
  it('shows the bare host', () => {
    expect(siteHost('https://www.example.com/a')).toBe('example.com');
    expect(siteHost('https://client-x.webflow.io/')).toBe('client-x.webflow.io');
    expect(siteHost('not a url')).toBe('not a url');
  });
});
