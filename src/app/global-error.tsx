'use client';

/**
 * آخرین تور — خطایی که خودِ چیدمانِ ریشه را می‌گیرد.
 *
 * ⚠️ اینجا عمداً نه ترجمه هست نه کامپوننتِ مشترک: اگر ریشه افتاده باشد،
 * فراهم‌کنندهٔ ترجمه هم نیست. هر چه اینجا وابستگی اضافه شود، می‌تواند
 * همان صفحهٔ آخر را هم بشکند.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>چیزی درست پیش نرفت.</h1>
          {error.digest && (
            <p style={{ fontSize: 12, opacity: 0.7, direction: 'ltr' }}>{error.digest}</p>
          )}
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: '8px 16px' }}>
            تلاشِ دوباره
          </button>
        </div>
      </body>
    </html>
  );
}
