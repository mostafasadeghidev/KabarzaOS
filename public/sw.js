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
