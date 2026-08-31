/**
 * اجرای مایگریشن‌ها. D-009 — در استارت یا دستورِ دیپلوی، نه دستی.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgres://kabarza:kabarza@localhost:6432/kabarza';
const sql = postgres(url, { max: 1 });

await migrate(drizzle(sql), { migrationsFolder: './src/db/migrations' });
await sql.end();
console.log('migrations applied');
