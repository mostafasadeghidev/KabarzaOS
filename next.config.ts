import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ایمیجِ کوچکِ داکر (D-009)
  output: 'standalone',
  /**
   * ⚠️ argon2 نسخهٔ قبلیِ nativeِ Node است. بدونِ این، Turbopack هنگامِ ساختِ
   * `instrumentation` شاخهٔ wasm/مرورگرش را هم resolve می‌کند و build
   * می‌شکند (@node-rs/argon2-wasm32-wasi). external یعنی در زمانِ اجرا از
   * node_modules ِ standalone خوانده شود — همان‌جا که واقعاً هست.
   */
  serverExternalPackages: ['@node-rs/argon2'],
  // خطاهای تایپ هرگز در بیلد نادیده گرفته نمی‌شوند (REQUIREMENTS الف-۱)
  typescript: { ignoreBuildErrors: false },
  /**
   * ⚠️ `staleTimes.dynamic: 0` تنها نیمِ راه است و `static: 0` را Next
   * نمی‌پذیرد (کمینه‌اش ۳۰ ثانیه است و کلِ بلوک را نامعتبر می‌کند). پس
   * کشِ ناوبری با `prefetch={false}` روی لینک‌های سایدبار خاموش می‌شود —
   * جایی که واقعاً اهمیت دارد.
   */
  experimental: {
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
