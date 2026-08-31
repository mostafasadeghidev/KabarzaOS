import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

/**
 * آماده‌سازیِ دیتابیسِ **جداگانهٔ** تست.
 *
 * ⚠️ چرا جدا؟ تست‌های یکپارچه با `truncate … cascade` شروع می‌شوند. تا وقتی
 * روی همان دیتابیسِ توسعه اجرا می‌شدند، هر بار `pnpm test:db` داده‌های واقعیِ
 * کار را پاک می‌کرد — یک بار همین اتفاق افتاد و باید دوباره seed می‌شد.
 *
 * globalSetup ِ vitest است: پیش از اجرای تست‌ها دیتابیس را می‌سازد (اگر نباشد)
 * و مهاجرت‌ها را روی آن اجرا می‌کند.
 */

const TEST_DB = 'kabarza_test';

/** آدرسِ دیتابیسِ تست، برگرفته از DATABASE_URL با تعویضِ نامِ دیتابیس. */
export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? 'postgres://kabarza:kabarza@localhost:6432/kabarza';
  const url = new URL(base);
  url.pathname = `/${TEST_DB}`;
  return url.toString();
}

export default async function setup() {
  const base = process.env.DATABASE_URL ?? 'postgres://kabarza:kabarza@localhost:6432/kabarza';
  const admin = new URL(base);
  admin.pathname = '/postgres';

  // ۱) ساختِ دیتابیس در صورتِ نبود. `create database` داخلِ تراکنش نمی‌رود،
  //    پس با اتصالِ ساده و simple-protocol اجرا می‌شود.
  const root = postgres(admin.toString(), { max: 1 });
  try {
    const exists = await root`select 1 from pg_database where datname = ${TEST_DB}`;
    if (exists.length === 0) {
      await root.unsafe(`create database ${TEST_DB}`);
      console.log(`دیتابیسِ تست ساخته شد: ${TEST_DB}`);
    }
  } finally {
    await root.end();
  }

  // ۲) مهاجرت‌ها روی دیتابیسِ تست.
  const sql = postgres(testDatabaseUrl(), { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: 'src/db/migrations' });
  } finally {
    await sql.end();
  }
}
