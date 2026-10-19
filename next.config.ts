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
  /**
   * خطاهای تایپ هرگز نادیده گرفته نمی‌شوند (REQUIREMENTS الف-۱) — فقط **جای**
   * بررسی عوض می‌شود: ایمیجِ GitHub Actions `tsc --noEmit` را پیش از ساخت جدا
   * اجرا می‌کند و ساختِ ایمیج را فقط با قبول‌شدنش شروع می‌کند، پس داخلِ
   * `next build` دوباره نمی‌سنجد (SKIP_TYPECHECK=1، حافظهٔ کمتر). هر ساختِ
   * دیگری — دستی، روی سرور یا محلی — مثلِ قبل می‌سنجد.
   */
  typescript: { ignoreBuildErrors: process.env.SKIP_TYPECHECK === '1' },
  /**
   * ⚠️ `staleTimes.dynamic: 0` تنها نیمِ راه است و `static: 0` را Next
   * نمی‌پذیرد (کمینه‌اش ۳۰ ثانیه است و کلِ بلوک را نامعتبر می‌کند). پس
   * کشِ ناوبری با `prefetch={false}` روی لینک‌های سایدبار خاموش می‌شود —
   * جایی که واقعاً اهمیت دارد.
   */
  /**
   * مرورگرها (و نمایشگرِ PDF) بی‌توجه به پیوندِ صفحه `/favicon.ico` را هم
   * می‌خواهند؛ همان آیکونِ برند جواب می‌دهد، نه ۴۰۴.
   */
  async rewrites() {
    return [{ source: '/favicon.ico', destination: '/brand-icon?size=32' }];
  },
  experimental: {
    staleTimes: { dynamic: 0 },
    cpus: 4,
    /**
     * ⚠️ سقفِ پیش‌فرضِ بدنهٔ server action یک مگابایت است، ولی پیوست تا
     * ۵۰ مگ مجاز است (files/upload). بی‌این، آپلودِ بزرگ‌تر از ۱ مگ پیش از
     * رسیدن به اعتبارسنجیِ ما با خطای مبهم می‌شکست. Caddy ِ سرور ۶۴ مگ می‌پذیرد.
     */
    serverActions: { bodySizeLimit: '60mb' },
  },
};

export default nextConfig;
