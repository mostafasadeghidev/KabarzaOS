import { describe, expect, it } from 'vitest';
import { extractLinkCards, hostOf, linkProvider, linkTitle, providerName } from './link-preview';

const FIGMA = 'https://www.figma.com/design/miEDmfwLXSfMAUCw34l18z/Peppers-Unlimited-|-UI-Kit?m=auto&t=btpjsL7m7Uo2huBu-6';
const FIGMA_TEAM = 'https://www.figma.com/design/nHUYDzPpsJQAiaqVycHEXa/Peppers-Unlimited?node-id=60-1635&t=9daQJcdXG1Qk2NEM-1';

describe('linkProvider / providerName', () => {
  it('سرویس‌های شناخته‌شده', () => {
    expect(linkProvider(FIGMA)).toBe('figma');
    expect(linkProvider('https://innovate-kabarza.webflow.io/')).toBe('webflow');
    expect(linkProvider('https://docs.google.com/document/d/abc/edit')).toBe('drive');
    expect(linkProvider('https://youtu.be/xyz')).toBe('video');
    expect(providerName(FIGMA)).toBe('Figma');
  });
  it('سایتِ ناشناخته با دامنه‌اش', () => {
    expect(linkProvider('https://example.com/a')).toBe('web');
    expect(providerName('https://www.example.com/a')).toBe('example.com');
    expect(hostOf('not a url')).toBe('');
  });
  it('دامنهٔ جعلیِ شبیه به سرویس شناخته نمی‌شود', () => {
    expect(linkProvider('https://figma.com.evil.io/x')).toBe('web');
  });
});

describe('linkTitle', () => {
  it('نامِ فایلِ فیگما از مسیر', () => {
    expect(linkTitle(FIGMA)).toBe('Peppers Unlimited | UI Kit');
    expect(linkTitle(FIGMA_TEAM)).toBe('Peppers Unlimited');
  });
  it('شناسه‌های بی‌معنا عنوان نمی‌شوند', () => {
    expect(linkTitle('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit')).toBe('Google Docs');
    expect(linkTitle('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz')).toBe('Google Drive');
    expect(linkTitle('https://innovate-kabarza.webflow.io/')).toBe('innovate-kabarza.webflow.io');
    expect(linkTitle('https://example.com/files/brand-guidelines.pdf')).toBe('brand guidelines');
  });
});

describe('extractLinkCards', () => {
  it('خط‌های تک‌پیوند (با برچسب) کارت می‌شوند و متن می‌ماند', () => {
    const text = 'We will get full access later.\nnow read only\nFigma: ' + FIGMA + '\nFigma (team): ' + FIGMA_TEAM;
    const out = extractLinkCards(text);
    expect(out.text).toBe('We will get full access later.\nnow read only');
    expect(out.cards).toEqual([
      { href: FIGMA, label: 'Figma' },
      { href: FIGMA_TEAM, label: 'Figma (team)' },
    ]);
  });
  it('پیوندِ وسطِ جمله در متن می‌ماند', () => {
    const out = extractLinkCards('see https://example.com for details');
    expect(out.cards).toEqual([]);
    expect(out.text).toBe('see https://example.com for details');
  });
  it('خطِ تک‌پیوندِ بی‌برچسب و نشانهٔ فهرست', () => {
    const out = extractLinkCards('- https://example.com/a.\n\n\n\nbody');
    expect(out.cards).toEqual([{ href: 'https://example.com/a', label: null }]);
    expect(out.text).toBe('body');
  });
});
