/**
 * مهاجرتِ خودکار هنگامِ بوتِ سرور — جایگزینِ اجرای tsx در entrypoint.
 *
 * ⚠️ چرا اینجا و نه اسکریپتِ جدا: خروجیِ standalone فقط ماژول‌هایی را حمل
 * می‌کند که از خودِ باندل trace شده باشند؛ اسکریپتِ بیرونی به `postgres`
 * نمی‌رسید (ERR_MODULE_NOT_FOUND). این فایل جزوِ باندل است، پس درایور و
 * drizzle همیشه همراهش هستند — و «دیپلوی = مهاجرت» بدونِ قدمِ دستی می‌ماند.
 *
 * ⚠️ چند-نمونه امن است: migrator ِ drizzle مهاجرت‌ها را در تراکنش با قفل
 * اجرا می‌کند؛ نمونهٔ دوم منتظر می‌ماند و چیزی دوباره اجرا نمی‌شود.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.SKIP_MIGRATIONS === '1') return;

  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrate] DATABASE_URL is not set — skipping migrations');
    return;
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: './src/db/migrations' });
    console.log('[migrate] up to date');
  } finally {
    await sql.end();
  }
}
