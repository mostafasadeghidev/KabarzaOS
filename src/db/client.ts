import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * اتصالِ دیتابیس.
 * ⚠️ R-PERF-02 — کش نباید بینِ درخواست‌ها یا کاربران نشت کند؛ اینجا فقط
 * استخرِ اتصال به اشتراک گذاشته می‌شود، نه دادهٔ کاربر.
 */

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://kabarza:kabarza@localhost:6432/kabarza';

declare global {
  // eslint-disable-next-line no-var
  var __kabarzaSql: ReturnType<typeof postgres> | undefined;
}

// در توسعه، hot-reload نباید استخرِ جدید بسازد.
const sql = globalThis.__kabarzaSql ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== 'production') globalThis.__kabarzaSql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export { sql };
