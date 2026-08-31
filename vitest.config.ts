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
  },
});
