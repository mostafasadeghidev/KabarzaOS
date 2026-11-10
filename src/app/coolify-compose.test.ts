import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * docker-compose.coolify.yml نسخهٔ «فقط ایمیج» ِ docker-compose.yml است (۲.۵۸.۱).
 *
 * ⚠️ دو فایلِ جدا یعنی خطرِ جدا افتادن: کسی سرویس یا متغیری به اصلی اضافه
 * می‌کند و نصبِ Coolify بی‌صدا ناقص می‌ماند. این گارد می‌گوید بخشِ services
 * عیناً یکی باشد، جز همان یک تفاوتِ عمدی.
 */
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const services = (s: string) => s.slice(s.indexOf('\nservices:\n'));

describe('docker-compose.coolify.yml', () => {
  const main = read('docker-compose.yml');
  const coolify = read('docker-compose.coolify.yml');

  it('هرگز روی سرور نمی‌سازد و همیشه ایمیج را می‌کشد', () => {
    expect(coolify).not.toMatch(/^\s*build:/m);
    expect(coolify).toMatch(/^ {4}pull_policy: always$/m);
  });

  it('جز خطِ build با فایلِ اصلی یکی است', () => {
    const expected = services(main).replace(
      /^ {4}build: \.\n/m,
      '',
    );
    const actual = services(coolify)
      .replace(/^ {4}# .*\n {4}pull_policy: always\n/m, '')
      // شبکهٔ ایمیلِ شرکتی (۲.۵۹.۱) — فقط در Coolify.
      .replace(/(?:^ {6}# .*\n)+ {6}mail: \{\}\n/m, '')
      .replace(/\nnetworks:\n(?: {2}.*\n)+(?=\nvolumes:)/, '');
    expect(actual).toBe(expected);
  });

  it('شبکهٔ ایمیل بیرونی است و بی تنظیم به شبکهٔ همیشه‌موجودِ coolify می‌رود', () => {
    expect(coolify).toMatch(/^ {2}mail:\n {4}external: true\n {4}name: \$\{STALWART_NETWORK:-coolify\}$/m);
  });

  it('هیچ رازی در خودِ فایل نیست', () => {
    // فقط جای‌گذاری از env یا پیش‌فرضِ داخلیِ بی‌خطر؛ مقدارِ واقعی در پنل.
    expect(coolify).not.toMatch(/(SECRET|TOKEN|PASSWORD|KEY)\s*[:=]\s*['"]?[A-Za-z0-9+/]{24,}/);
  });
});
