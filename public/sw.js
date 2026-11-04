/*
 * سرویس‌ورکرِ PWA (۲.۵۴.۰).
 *
 * ⚠️ عمداً هیچ دادهٔ برنامه‌ای کش نمی‌شود: صفحه‌ها اطلاعاتِ خصوصی و زنده‌اند
 * (پول، تسک، پیام) و نسخهٔ کهنه یا جامانده روی دستگاهِ مشترک خطرناک‌تر از
 * «اتصال برقرار نیست» است. فقط صفحهٔ آفلاین کش می‌شود و وقتی شبکه نیست به‌جای
 * صفحهٔ خطای مرورگر نشان داده می‌شود.
 */
const CACHE = 'kabarza-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// فقط ناوبریِ صفحه (نه API، نه فایل): شبکه اول، و اگر نشد صفحهٔ آفلاین.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.open(CACHE).then((cache) => cache.match(OFFLINE_URL))),
  );
});

/*
 * اعلانِ فوری (۲.۵۶.۰) — سرور پیامِ رمزگذاری‌شده را از راهِ سرویسِ اعلانِ مرورگر
 * می‌فرستد؛ اینجا نشان داده می‌شود، حتی وقتی برنامه بسته است.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Kabarza';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/brand-icon?size=192',
    badge: '/brand-icon?size=192',
    tag: data.tag || undefined,
    data: { url: data.url || '/notifications' },
  }));
});

// کلیک روی اعلان: پنجرهٔ بازِ برنامه را به همان صفحه می‌برد، وگرنه پنجرهٔ تازه.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === target.origin && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target.href).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});
