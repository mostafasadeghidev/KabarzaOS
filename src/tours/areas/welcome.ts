import type { Tour } from '../types';

/** راهنماهای بخشِ «welcome» — هر عامل فقط فایلِ بخشِ خودش را پر می‌کند. */
export const tours: Tour[] = [
  {
    // نمونهٔ آزمونِ موتور — عاملِ این بخش با راهنمای واقعی جایگزینش می‌کند.
    id: 'engine-sample',
    title: 'آزمونِ موتورِ راهنما',
    description: 'چند قدمِ کوتاه برای آزمودنِ راهنما.',
    audience: (c) => c.isOwner,
    autoStart: true,
    steps: [
      { id: 'hi', title: 'خوش آمدید', body: 'این یک راهنمای آزمایشی است. با «بعدی» جلو بروید.' },
      { id: 'nav', target: 'nav-projects', kind: 'click', advanceOnPath: '/projects', title: 'منوی پروژه‌ها', body: 'روی «پروژه‌ها» بزنید تا فهرستِ پروژه‌ها باز شود.' },
      { id: 'menu', target: 'user-menu-tours', path: '/projects', optional: true, title: 'راهنمای برنامه', body: 'این مورد در منوی کاربر است.' },
      { id: 'bye', title: 'تمام', body: 'همهٔ راهنماها در منوی کاربر ← «راهنمای برنامه» هستند.' },
    ],
  },
];
