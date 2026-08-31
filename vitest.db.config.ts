import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * تست‌های یکپارچه — نیازمندِ Postgres در حالِ اجرا.
 *
 * ⚠️ ترتیبی اجرا می‌شوند: همهٔ فایل‌ها یک دیتابیس مشترک دارند و اجرای
 * موازیِ truncate باعثِ deadlock می‌شود.
 *
 * ⚠️ روی دیتابیسِ **جداگانهٔ** `kabarza_test` اجرا می‌شوند، نه دیتابیسِ توسعه —
 * وگرنه truncate ِ ابتدای هر فایل داده‌های واقعیِ کار را می‌برد.
 *
 * ⚠️ به همان دلیل، باکتِ ذخیره‌سازی هم جداست: تستِ حذف واقعاً شیء پاک می‌کند.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/db/__tests__/**/*.test.ts'],
    globalSetup: ['scripts/test-db.ts'],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://kabarza:kabarza@localhost:6432/kabarza_test',
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'kabarza-test',
      S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? 'kabarza',
      S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? 'kabarza-dev-1234',
    },
    testTimeout: 20000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
