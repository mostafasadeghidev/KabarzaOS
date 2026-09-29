import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    // تست‌های یکپارچه به Postgres نیاز دارند و جدا اجرا می‌شوند:
    //   docker compose up -d db && pnpm test:db
    exclude: ['**/node_modules/**', '**/.next/**', 'src/db/__tests__/**'],
    // ⚠️ چند گارد کلِ `src` را می‌خوانند و با پارسرِ babel تجزیه می‌کنند (جهتِ
    // `num`، جایگاهِ قلاب‌ها، RTL). وقتی ماشین زیرِ بار است (سرورِ توسعه روشن)
    // از پنج ثانیهٔ پیش‌فرض می‌گذشتند و **تصادفی** یکی‌شان می‌شکست — شکستی که
    // هیچ ربطی به درستیِ کد نداشت.
    testTimeout: 30_000,
  },
});
