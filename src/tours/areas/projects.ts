import { can, type Tour, type TourCtx, type TourStep } from '../types';

/**
 * راهنماهای بخشِ «projects» (۳.۱۹.۰) — فهرستِ پروژه‌ها، ساخت و ویرایش، صفحهٔ پروژه و همهٔ تب‌هایش.
 *
 * ⚠️ هیچ قدمِ «کلیک» روی دکمه‌ای نیست که چیزی ذخیره/ارسال/حذف کند؛ آن‌ها فقط با قدمِ «دیدن» توضیح داده می‌شوند.
 * ⚠️ قدم‌هایی که پنجره (دیالوگ) باز می‌کنند ته‌ِ راهنما می‌آیند: در قدمِ «دیدن» کاربر نمی‌تواند پنجره را ببندد.
 * ⚠️ دکمه‌های تب را `OverflowTabs` می‌سازد؛ تبی که جا نشود زیرِ «بیشتر» می‌رود — متنِ قدم این را می‌گوید.
 */

/** هر کسی که پروژه‌ای می‌بیند (کادر، عضو، مدیرِ تیم/پروژه یا کارفرما). */
const seesProjects = (c: TourCtx) =>
  c.isOwner || can(c, 'projects.view') || c.isMember || c.isPm || c.managesTeam || c.roles.includes('client');
/** می‌تواند پروژه بسازد: مالک، مجوزِ سراسری یا مدیرِ دفتر. */
const createsProjects = (c: TourCtx) => c.isOwner || can(c, 'projects.manage') || c.managesTeam;
/** دستِ‌کم یک پروژه را مدیریت می‌کند (ویرایش، اعضا، QA، تنظیمات). */
const managesProjects = (c: TourCtx) => createsProjects(c) || c.isPm;
/** کادر/عضو — نه کارفرمای خالص. */
const team = (c: TourCtx) => seesProjects(c) && !c.isClientOnly;
/** پولِ کلِ پروژه (قیمت، تیم، تراکنش‌ها) را می‌بیند. */
const seesProjectMoney = (c: TourCtx) =>
  c.isOwner || can(c, 'projects.manage') || can(c, 'finance.view') || c.roles.includes('client');

/** رفتن به «پروژه‌ها». */
const navStep: TourStep = {
  id: 'nav', target: 'nav-projects', kind: 'click', advanceOnPath: '/projects',
  title: 'منوی «پروژه‌ها»', body: 'روی «پروژه‌ها» در منو بزنید تا فهرستِ پروژه‌ها باز شود.',
};
/** باز کردنِ یک پروژه از کارتش. */
const openStep: TourStep = {
  id: 'open', target: 'projects-card-open', kind: 'click', path: '/projects', advanceOnPath: '/projects/',
  title: 'باز کردنِ یک پروژه', body: 'روی «مشاهده» ِ یکی از کارت‌ها بزنید تا صفحهٔ آن پروژه باز شود.',
};
const openProject: TourStep[] = [navStep, openStep];

export const tours: Tour[] = [
  // ───────────────────────── فهرستِ پروژه‌ها ─────────────────────────
  {
    id: 'projects-list',
    title: 'فهرستِ پروژه‌ها',
    description: 'تب‌های وضعیت، جستجو و هر بخشِ کارتِ پروژه.',
    audience: seesProjects,
    order: 20,
    next: ['projects-page', 'projects-create'],
    steps: [
      navStep,
      {
        id: 'filters', target: 'projects-filters', path: '/projects',
        title: 'تب‌های وضعیت',
        body: 'پروژه‌ها بر اساسِ وضعیت دسته شده‌اند و عددِ کنارِ هر تب تعدادِ آن دسته است. تب‌هایی که جا نشوند زیرِ «بیشتر» می‌روند.',
      },
      {
        id: 'relations', target: 'projects-relations', path: '/projects', optional: true,
        title: 'رابطهٔ شما با پروژه',
        body: 'اگر در چند نقش با پروژه‌ها سروکار دارید، اینجا جدا می‌کنید: «پروژه‌های شما»، پروژه‌هایی که کارفرمایشان هستید یا پروژه‌های دفاترِ تحتِ مدیریتِ شما.',
      },
      {
        id: 'search', target: 'projects-search', path: '/projects',
        title: 'جستجوی پروژه',
        body: 'نامِ پروژه را بنویسید؛ جستجو در همهٔ تب‌ها، حتی بایگانی، انجام می‌شود. با Enter اولین نتیجه باز می‌شود.',
      },
      {
        id: 'list', target: 'projects-list', path: '/projects', optional: true,
        title: 'کارت‌های پروژه',
        body: 'هر کارت خلاصهٔ یک پروژه است. اگر پروژه‌ها زیاد باشند، پایینِ فهرست صفحه‌بندی دارد.',
      },
      {
        id: 'card', target: 'projects-card', path: '/projects', optional: true,
        title: 'یک کارت',
        body: 'بالای کارت نامِ پروژه و تصویرِ شاخص است. روبانِ گوشه «بایگانی» یا «مناقصه» بودنِ پروژه را نشان می‌دهد.',
      },
      {
        id: 'status', target: 'projects-card-status', path: '/projects', optional: true,
        title: 'وضعیتِ پروژه',
        body: 'این برچسب وضعیتِ فعلیِ پروژه است. اگر مدیرِ این پروژه باشید، با زدنِ آن فهرستِ وضعیت‌ها باز می‌شود و انتخابِ هر مورد فوراً ذخیره می‌شود.',
      },
      {
        id: 'deadline', target: 'projects-card-deadline', path: '/projects', optional: true,
        title: 'نوارِ ددلاین',
        body: 'این نوار نشان می‌دهد چقدر از زمانِ پروژه گذشته و چند روز مانده است. رنگش از سبز به نارنجی و قرمز می‌رود؛ پروژهٔ تمام‌شده نوار ندارد.',
      },
      {
        id: 'review', target: 'projects-card-review', path: '/projects', optional: true,
        title: 'نیازمندِ بررسی',
        body: 'عددِ «تسک‌ها» تسک‌هایی است که منتظرِ ریویو هستند و عددِ «کامنت» کامنت‌هایی که هنوز بررسی نشده‌اند. با زدنِ هر کدام مستقیم به همان بخش می‌روید.',
      },
      {
        id: 'progress', target: 'projects-card-progress', path: '/projects', optional: true,
        title: 'پیشرفتِ پروژه',
        body: 'درصدِ تسک‌های انجام‌شده از کلِ تسک‌ها. زیرش تعدادشان آمده است؛ با زدنِ نوار به تبِ «تسک‌ها» می‌روید.',
      },
      {
        id: 'people', target: 'projects-card-people', path: '/projects', optional: true,
        title: 'کارفرما و تیم',
        body: 'چیپ‌های آبی کارفرمایان و چیپ‌های خاکستری اعضای تیم با نقششان هستند.',
      },
      {
        id: 'quick-add', target: 'projects-card-quick-add', path: '/projects', optional: true, when: managesProjects,
        title: 'افزودنِ سریع',
        body: 'با «افزودن عضو» یا «افزودن کارفرما» بی‌آنکه پروژه را باز کنید کسی را به آن اضافه می‌کنید؛ دکمهٔ «افزودن» ِ فرمِ کوچک ذخیره می‌کند.',
      },
      openStep,
    ],
  },

  // ───────────────────────── ساختنِ پروژه ─────────────────────────
  {
    id: 'projects-create',
    title: 'ساختنِ پروژهٔ تازه',
    description: 'فرمِ «افزودن پروژه»: اطلاعات، تاریخ‌ها، مبلغ، تیم و کارفرما.',
    audience: createsProjects,
    order: 21,
    next: ['projects-create-extras', 'projects-team'],
    steps: [
      navStep,
      {
        id: 'add', target: 'projects-add', kind: 'click', path: '/projects',
        title: 'افزودن پروژه', body: 'روی «افزودن پروژه» بزنید تا فرمِ ساختِ پروژه باز شود. تا «ساخت پروژه» را نزنید چیزی ذخیره نمی‌شود.',
      },
      {
        id: 'form', target: 'project-form-tabs', path: '/projects',
        title: 'بخش‌های فرم',
        body: 'فرم چند تب دارد: «اطلاعات» برای پایهٔ پروژه، و «تسک‌ها»، «فایل‌ها» و «QA» برای چیزهایی که هم‌زمان با ساخت اضافه می‌شوند.',
      },
      {
        id: 'title', target: 'project-form-title', path: '/projects',
        title: 'عنوان و توضیحات', body: 'نامِ پروژه را اینجا بنویسید. زیرش «توضیحات» است که بالای صفحهٔ پروژه دیده می‌شود.',
      },
      {
        id: 'thumb', target: 'project-form-thumb', path: '/projects', optional: true,
        title: 'تصویرِ شاخص',
        body: 'یک تصویر (مثلاً اسکرین‌شاتِ سایت) انتخاب کنید تا روی کارت و صفحهٔ پروژه بنشیند. بدونِ تصویر، تک‌نگارِ رنگی نشان داده می‌شود.',
      },
      {
        id: 'dates', target: 'project-form-dates', path: '/projects',
        title: 'تاریخ، وضعیت و مبلغ',
        body: '«تاریخ ثبت»، «ددلاین» و «وضعیت پروژه» را تعیین کنید. اگر اجازهٔ دیدنِ پول را دارید «مبلغ پروژه» و «ارز» هم اینجاست، و «دفتر» مشخص می‌کند پروژه زیرِ کدام تیم است.',
      },
      {
        id: 'urls', target: 'project-form-urls', path: '/projects',
        title: 'دامنهٔ سایت',
        body: '«دامنهٔ اصلی» و «دامنهٔ آزمایشی» روی کارت و صفحهٔ پروژه پیوند می‌شوند. با تیکِ «نمایشِ لینک‌ها به کارفرما» کارفرما هم آن‌ها را می‌بیند.',
      },
      {
        id: 'unit', target: 'project-form-unit', path: '/projects',
        title: 'پروژهٔ تعدادی',
        body: 'اگر دستمزد به‌ازای هر واحد کار است این را تیک بزنید؛ آن‌وقت هر عضو «نرخِ هر واحد» دارد و کارکردش را ثبت می‌کند.',
      },
      {
        id: 'tender', target: 'project-form-tender', path: '/projects', optional: true,
        title: 'مناقصه',
        body: 'با «این پروژه یک مناقصه است» نقش‌های لازم و سقفِ قیمتِ هر نقش را می‌نویسید تا اعضا پیشنهادِ قیمت بدهند.',
      },
      {
        id: 'members', target: 'project-form-members', path: '/projects', optional: true,
        title: 'اعضا',
        body: 'اعضای تیم را با نقش، نوعِ دستمزد (قراردادی یا تعدادی) و مبلغ یا نرخشان اضافه کنید. نقشِ مدیرِ پروژه هم از همین‌جا داده می‌شود.',
      },
      {
        id: 'clients', target: 'project-form-clients', path: '/projects', optional: true,
        title: 'کارفرمایان',
        body: 'کارفرمای پروژه را انتخاب کنید. کارفرمای نخست مخاطبِ تسک‌هایی است که به «کارفرما» سپرده می‌شوند.',
      },
      {
        id: 'save', target: 'project-form-save', path: '/projects',
        title: 'ساختِ پروژه',
        body: 'وقتی آماده بودید «ساخت پروژه» را بزنید؛ پروژه ساخته و صفحه‌اش باز می‌شود. «انصراف» فرم را بی‌ذخیره می‌بندد.',
      },
    ],
  },
  {
    id: 'projects-create-extras',
    title: 'تسک، فایل و QA هنگامِ ساخت',
    description: 'تب‌های «تسک‌ها»، «فایل‌ها» و «QA» در فرمِ ساختِ پروژه.',
    audience: createsProjects,
    order: 22,
    next: ['projects-page'],
    steps: [
      navStep,
      {
        id: 'add', target: 'projects-add', kind: 'click', path: '/projects',
        title: 'افزودن پروژه', body: 'روی «افزودن پروژه» بزنید تا فرم باز شود.',
      },
      {
        id: 'tab-tasks', target: 'project-form-tab-tasks', kind: 'click', path: '/projects',
        title: 'تبِ «تسک‌ها»', body: 'روی «تسک‌ها» بزنید.',
      },
      {
        id: 'tasks', target: 'project-form-tasks', path: '/projects',
        title: 'تسک‌های اولیه',
        body: 'تسک‌هایی که پروژه با آن‌ها شروع می‌شود را بنویسید. هر تسک به یک یا چند نقش سپرده می‌شود یا با «سپردن به کارفرما» به کارفرما.',
      },
      {
        id: 'tab-files', target: 'project-form-tab-files', kind: 'click', path: '/projects',
        title: 'تبِ «فایل‌ها»', body: 'روی «فایل‌ها» بزنید.',
      },
      {
        id: 'files', target: 'project-form-files', path: '/projects',
        title: 'فایل‌های پروژه',
        body: 'فایل و تصویر را با کلیک انتخاب کنید یا روی کادر رها کنید؛ پس از ساختِ پروژه بارگذاری می‌شوند.',
      },
      {
        id: 'links', target: 'project-form-links', path: '/projects',
        title: 'لینک‌های بیرونی',
        body: 'نشانیِ فیگما، گوگل‌درایو و مانندِ آن را با یک برچسب اضافه کنید؛ فقط نشانی ذخیره می‌شود.',
      },
      {
        id: 'tab-qa', target: 'project-form-tab-qa', kind: 'click', path: '/projects',
        title: 'تبِ «QA»', body: 'روی «QA» بزنید.',
      },
      {
        id: 'qa', target: 'project-form-qa', path: '/projects', optional: true,
        title: 'چک‌لیستِ کیفیت',
        body: 'نقش‌ها را انتخاب کنید تا آیتم‌های کتابخانهٔ QA ِ آن نقش‌ها روی پروژه بنشیند. با «آیتم‌های کارفرما هم اضافه شوند» چک‌لیستِ کارفرما هم می‌آید.',
      },
      {
        id: 'save', target: 'project-form-save', path: '/projects',
        title: 'ساختِ پروژه',
        body: 'همهٔ این‌ها با «ساخت پروژه» یک‌جا ثبت می‌شوند. اگر فقط نگاه می‌کردید، «انصراف» را بزنید.',
      },
    ],
  },

  // ───────────────────────── صفحهٔ پروژه ─────────────────────────
  {
    id: 'projects-page',
    title: 'صفحهٔ پروژه و تب‌هایش',
    description: 'سرصفحه، نوارِ خلاصه، پیشرفت و تب‌های صفحهٔ پروژه.',
    audience: team,
    order: 23,
    next: ['projects-files', 'projects-team', 'projects-money'],
    steps: [
      ...openProject,
      {
        id: 'header', target: 'project-header', path: '/projects/',
        title: 'سرصفحهٔ پروژه',
        body: 'نام، تصویر و توضیحاتِ پروژه اینجاست و زیرش برچسبِ وضعیت. مدیرِ پروژه وضعیت را از همین برچسب عوض می‌کند و دکمهٔ «ویرایش» هم کنارِ آن است.',
      },
      {
        id: 'code', target: 'project-code', path: '/projects/', optional: true,
        title: 'کدِ پروژه',
        body: 'هر تسکِ این پروژه با این کد و یک شماره نام‌گذاری می‌شود؛ بیرون از پروژه هم با همین کد به تسک اشاره می‌کنید.',
      },
      {
        id: 'facts', target: 'project-facts', path: '/projects/',
        title: 'نوارِ خلاصه',
        body: 'تاریخِ ثبت، ددلاین و روزهای مانده، ساعت‌های کاری، تعدادِ اعضا، تسک‌ها و کامنت‌های باز. «تسکِ باز» و «کامنتِ باز» قابلِ کلیک‌اند.',
      },
      {
        id: 'progress', target: 'project-progress', path: '/projects/',
        title: 'درصدِ پیشرفت',
        body: 'درصدِ تسک‌های انجام‌شده از کلِ تسک‌های پروژه؛ داخلِ پرانتز تعدادشان آمده است.',
      },
      {
        id: 'tabs', target: 'project-tabs', path: '/projects/',
        title: 'تب‌های پروژه',
        body: 'هر کارِ پروژه یک تب دارد. عددِ کنارِ تب تعدادِ موردهای آن است. تب‌هایی که جا نشوند زیرِ «بیشتر» می‌روند.',
      },
      {
        id: 'tab-info', target: 'project-tab-info', kind: 'click', path: '/projects/',
        title: 'تبِ «اطلاعات»', body: 'روی «اطلاعات» بزنید.',
      },
      {
        id: 'site', target: 'project-info-site', path: '/projects/', optional: true,
        title: 'سایتِ پروژه', body: 'پیوندِ دامنهٔ اصلی و آزمایشیِ پروژه.',
      },
      {
        id: 'units', target: 'project-info-units', path: '/projects/', optional: true,
        title: 'کارکردها',
        body: 'در پروژهٔ تعدادی، تعدادِ کارِ هر تاریخ اینجا ثبت می‌شود و مبلغ از نرخِ هر واحد حساب می‌شود.',
      },
      {
        id: 'clients', target: 'project-info-clients', path: '/projects/',
        title: 'کارفرمایان', body: 'کارفرمایانِ این پروژه؛ اولی «کارفرمای اصلی» است.',
      },
      {
        id: 'tab-tasks', target: 'project-tab-tasks', kind: 'click', path: '/projects/',
        title: 'تبِ «تسک‌ها»', body: 'روی «تسک‌ها» بزنید. اگر این تب را نمی‌بینید، از «بیشتر» در انتهای نوارِ تب بازش کنید.',
      },
      {
        id: 'tasks', target: 'tasks-add', path: '/projects/', optional: true,
        title: 'کارهای پروژه',
        body: 'همهٔ تسک‌های پروژه اینجاست و با این دکمه تسکِ تازه می‌سازید. راهنمای «ساختنِ تسک» جزئیاتش را نشان می‌دهد.',
      },
      {
        id: 'tab-comments', target: 'project-tab-comments', kind: 'click', path: '/projects/',
        title: 'تبِ «کامنت‌ها»', body: 'روی «کامنت‌ها» بزنید. اگر این تب را نمی‌بینید، از «بیشتر» در انتهای نوارِ تب بازش کنید.',
      },
      {
        id: 'comments', target: 'comment-input', path: '/projects/', optional: true,
        title: 'گفتگو دربارهٔ پروژه',
        body: 'اینجا با تیم و کارفرما دربارهٔ پروژه گفتگو می‌کنید و فایل و تصویر هم می‌فرستید.',
      },
      {
        id: 'more', target: 'project-tab-more', path: '/projects/', optional: true,
        title: 'تب‌های بیشتر',
        body: 'بقیهٔ تب‌ها، مثلِ «مالی»، «QA»، «تیم و ساعت» و «تنظیمات»، اینجا هستند. هر کدام راهنمای خودش را دارد.',
      },
    ],
  },
  {
    id: 'projects-edit',
    title: 'ویرایشِ پروژه',
    description: 'عوض کردنِ اطلاعات، تصویر و وضعیتِ یک پروژه.',
    audience: managesProjects,
    order: 24,
    next: ['projects-team', 'projects-settings'],
    steps: [
      ...openProject,
      {
        id: 'header', target: 'project-header', path: '/projects/',
        title: 'وضعیت از سرصفحه',
        body: 'برای عوض کردنِ وضعیت، روی برچسبِ وضعیتِ زیرِ نام بزنید و یکی را انتخاب کنید؛ انتخاب فوراً ذخیره می‌شود.',
      },
      {
        id: 'edit', target: 'project-edit', kind: 'click', path: '/projects/',
        title: 'ویرایش', body: 'روی «ویرایش» بزنید تا فرمِ پروژه باز شود.',
      },
      {
        id: 'form', target: 'project-form', path: '/projects/',
        title: 'فرمِ ویرایش',
        body: 'همان فیلدهای ساختِ پروژه است: عنوان، توضیحات، تاریخ‌ها، وضعیت، دفتر، دامنه‌ها و مناقصه. اعضا و تسک‌ها از بخش‌های خودشان مدیریت می‌شوند.',
      },
      {
        id: 'thumb', target: 'project-form-thumb', path: '/projects/', optional: true,
        title: 'عوض کردنِ تصویر',
        body: 'تصویرِ تازه انتخاب کنید تا جای قبلی بنشیند، یا «حذفِ تصویرِ فعلی» را تیک بزنید.',
      },
      {
        id: 'save', target: 'project-form-save', path: '/projects/',
        title: 'ذخیره',
        body: '«اعمال» تغییرات را ذخیره می‌کند و پنجره باز می‌ماند؛ «ذخیره و بستن» ذخیره می‌کند و می‌بندد. «بستن» تغییرِ ذخیره‌نشده را دور می‌ریزد.',
      },
    ],
  },
  {
    id: 'projects-client-view',
    title: 'پروژه از نگاهِ کارفرما',
    description: 'چه چیزهایی از پروژه‌تان را می‌بینید و کجا.',
    audience: (c) => c.isClientOnly,
    order: 20,
    next: ['projects-files'],
    steps: [
      ...openProject,
      {
        id: 'header', target: 'project-header', path: '/projects/',
        title: 'پروژهٔ شما', body: 'نام، توضیحات و وضعیتِ فعلیِ پروژه را اینجا می‌بینید.',
      },
      {
        id: 'facts', target: 'project-facts', path: '/projects/',
        title: 'خلاصهٔ پروژه', body: 'ددلاین، درصدِ پیشرفت و تعدادِ تسک‌ها و کامنت‌های باز.',
      },
      {
        id: 'tabs', target: 'project-tabs', path: '/projects/',
        title: 'بخش‌های پروژه', body: 'هر بخشِ پروژه یک تب است. اگر این تب را نمی‌بینید، از «بیشتر» در انتهای نوارِ تب بازش کنید.',
      },
      {
        id: 'tab-tasks', target: 'project-tab-tasks', kind: 'click', path: '/projects/',
        title: 'تسک‌ها',
        body: 'روی «تسک‌ها» بزنید. کارهایی که به شما سپرده شده (مثلاً فرستادنِ محتوا) اینجا هستند.',
      },
      {
        id: 'tab-reviews', target: 'project-tab-reviews', kind: 'click', path: '/projects/', optional: true,
        title: 'بازبینی‌ها', body: 'روی «بازبینی‌ها» بزنید.',
      },
      {
        id: 'reviews', target: 'project-reviews-list', path: '/projects/', optional: true,
        title: 'بازبینی‌های شما', body: 'بازبینی‌هایی که تیم برای شما آشکار کرده؛ هر کدام ویدئو و فهرستِ موردها و پیشرفتشان را دارد.',
      },
      {
        id: 'tab-files', target: 'project-tab-files', kind: 'click', path: '/projects/',
        title: 'فایل‌ها', body: 'روی «فایل‌ها» بزنید.',
      },
      {
        id: 'files', target: 'project-files-drop', path: '/projects/', optional: true,
        title: 'فرستادنِ فایل',
        body: 'فایل یا تصویرتان را اینجا رها کنید، بچسبانید (Ctrl+V) یا با کلیک انتخاب کنید و بعد «بارگذاری» را بزنید تا تیم ببیند.',
      },
      {
        id: 'tab-finance', target: 'project-tab-finance', kind: 'click', path: '/projects/', optional: true,
        title: 'مالی', body: 'روی «مالی» بزنید.',
      },
      {
        id: 'money', target: 'project-money-client', path: '/projects/', optional: true,
        title: 'قیمت و پرداخت‌ها', body: 'قیمتِ پروژه، آنچه پرداخته‌اید و مانده. «فاکتور» نسخهٔ چاپیِ آن را باز می‌کند.',
      },
      {
        id: 'tab-qa', target: 'project-tab-qa', kind: 'click', path: '/projects/', optional: true,
        title: 'چک‌لیستِ شما', body: 'روی «QA» بزنید.',
      },
      {
        id: 'qa', target: 'project-qa-list', path: '/projects/', optional: true,
        title: 'آیتم‌های کارفرما',
        body: 'آیتم‌هایی که بررسی‌شان با شماست. وقتی هر کدام را بررسی کردید تیکش بزنید تا مدیرِ پروژه ببیند.',
      },
    ],
  },

  // ───────────────────────── اعضا و کارفرمایان ─────────────────────────
  {
    id: 'projects-team',
    title: 'اعضا، کارفرمایان و نقش‌ها',
    description: 'دیدن و مدیریتِ تیم و کارفرمایانِ یک پروژه.',
    audience: managesProjects,
    order: 25,
    next: ['projects-settings'],
    steps: [
      ...openProject,
      {
        id: 'tab-info', target: 'project-tab-info', kind: 'click', path: '/projects/',
        title: 'تبِ «اطلاعات»', body: 'روی «اطلاعات» بزنید.',
      },
      {
        id: 'members', target: 'project-info-members', path: '/projects/', optional: true,
        title: 'اعضای پروژه',
        body: 'هر عضو با نقشش (مثلاً مدیرِ پروژه یا طراح) آمده است. ستونِ مبلغ فقط برای مالک، مدیرِ کلِ پروژه‌ها و مدیرِ مالی دیده می‌شود.',
      },
      {
        id: 'access', target: 'project-member-access', path: '/projects/', optional: true,
        title: 'قطعِ دسترسی',
        body: 'این دکمه دسترسیِ عضو را به همین پروژه قطع یا بازمی‌گرداند و سابقه‌اش می‌ماند؛ زدنش فوراً اعمال می‌شود.',
      },
      {
        id: 'remove', target: 'project-member-remove', path: '/projects/', optional: true,
        title: 'حذف از پروژه',
        body: 'عضو را از پروژه برمی‌دارد؛ پیش از حذف تأیید می‌خواهد و پرداخت‌های ثبت‌شده‌اش می‌مانند.',
      },
      {
        id: 'clients', target: 'project-info-clients', path: '/projects/',
        title: 'کارفرمایان', body: 'کارفرمایانِ پروژه؛ اولی «کارفرمای اصلی» است و تسک‌های «کارفرما» به او می‌رسد.',
      },
      {
        id: 'clients-edit', target: 'project-clients-edit', path: '/projects/', optional: true,
        title: 'ویرایشِ کارفرمایان',
        body: 'با «ویرایشِ کارفرمایان» کارفرما اضافه یا کم می‌کنید و با «ذخیرهٔ کارفرمایان» ثبت می‌شود.',
      },
      {
        id: 'manage', target: 'project-members-manage', kind: 'click', path: '/projects/', optional: true,
        title: 'مدیریتِ اعضا', body: 'روی «مدیریتِ اعضا» بزنید تا فهرستِ اعضا باز شود.',
      },
      {
        id: 'dialog', target: 'project-members-dialog', path: '/projects/', optional: true,
        title: 'ردیف‌های اعضا',
        body: 'برای هر ردیف عضو، نقش، نوعِ دستمزد (قراردادی یا تعدادی)، مبلغ یا نرخ و ارز را تعیین کنید. عضوِ سابق یا تسویه‌نشده با حذفِ ردیف هم سابقه‌اش می‌ماند.',
      },
      {
        id: 'add-row', target: 'project-members-add-row', path: '/projects/', optional: true,
        title: 'ردیفِ تازه', body: '«افزودن عضو» یک ردیفِ خالی اضافه می‌کند تا عضوِ تازه را انتخاب کنید.',
      },
      {
        id: 'save', target: 'project-members-save', path: '/projects/', optional: true,
        title: 'ذخیرهٔ اعضا',
        body: 'تغییرات با «ذخیرهٔ اعضا» ثبت می‌شود؛ «بستن» بی‌ذخیره می‌بندد.',
      },
    ],
  },

  // ───────────────────────── فایل‌ها ─────────────────────────
  {
    id: 'projects-files',
    title: 'فایل‌ها و لینک‌های پروژه',
    description: 'بارگذاری، سنجاق، دانلود و لینک‌های بیرونی.',
    audience: seesProjects,
    order: 26,
    next: ['projects-qa'],
    steps: [
      ...openProject,
      {
        id: 'tab', target: 'project-tab-files', kind: 'click', path: '/projects/',
        title: 'تبِ «فایل‌ها»', body: 'روی «فایل‌ها» بزنید. اگر این تب را نمی‌بینید، از «بیشتر» در انتهای نوارِ تب بازش کنید.',
      },
      {
        id: 'link-form', target: 'project-files-link-form', path: '/projects/', optional: true,
        title: 'منابع و لینک‌ها',
        body: 'نشانیِ فیگما، گوگل‌درایو یا سایتِ آزمایشی را با یک برچسب بنویسید و «افزودن» را بزنید؛ فقط نشانی نگه داشته می‌شود.',
      },
      {
        id: 'links', target: 'project-files-links', path: '/projects/', optional: true,
        title: 'لینک‌های ثبت‌شده', body: 'با زدنِ هر کارت لینک در صفحهٔ تازه باز می‌شود. لینکِ سنجاق‌شده بالای فهرست می‌ماند.',
      },
      {
        id: 'drop', target: 'project-files-drop', path: '/projects/', optional: true,
        title: 'انتخابِ فایل',
        body: 'فایل‌ها را با کلیک انتخاب کنید، روی کادر بکشید و رها کنید، یا اسکرین‌شات را با Ctrl+V بچسبانید. چند فایل با هم هم می‌شود.',
      },
      {
        id: 'label', target: 'project-files-label', path: '/projects/', optional: true,
        title: 'برچسبِ فایل', body: 'اختیاری است؛ مثلاً «قرارداد امضاشده». با چند فایل، برچسب‌ها شماره می‌گیرند.',
      },
      {
        id: 'upload', target: 'project-files-upload', path: '/projects/', optional: true,
        title: 'بارگذاری',
        body: 'با «بارگذاری» فایل‌ها فرستاده می‌شوند. می‌توانید در برنامه جابه‌جا شوید؛ بارگذاری ادامه دارد.',
      },
      {
        id: 'list', target: 'project-files-list', path: '/projects/', optional: true,
        title: 'پیوست‌ها', body: 'همهٔ فایل‌های پروژه با فرستنده و حجم. با زدنِ کارت، فایل باز می‌شود.',
      },
      {
        id: 'actions', target: 'project-files-actions', path: '/projects/', optional: true,
        title: 'کارهای هر فایل',
        body: 'ویدئو را همین‌جا پخش کنید یا فایل را دانلود کنید. فرستنده و مدیر می‌توانند فایل را سنجاق یا حذف کنند.',
      },
      {
        id: 'zip', target: 'project-files-zip', path: '/projects/', optional: true,
        title: 'دانلودِ همه', body: '«دانلودِ همه (zip)» همهٔ فایل‌هایی را که می‌بینید یک‌جا می‌گیرد.',
      },
    ],
  },

  // ───────────────────────── QA ─────────────────────────
  {
    id: 'projects-qa',
    title: 'چک‌لیستِ QA',
    description: 'آیتم‌های تیم و کارفرما، تسک‌های QA و تیک زدن.',
    audience: team,
    order: 27,
    next: ['projects-reviews'],
    steps: [
      ...openProject,
      {
        id: 'tab', target: 'project-tab-qa', kind: 'click', path: '/projects/',
        title: 'تبِ «QA»', body: 'روی «QA» بزنید. اگر این تب را نمی‌بینید، از «بیشتر» در انتهای نوارِ تب بازش کنید.',
      },
      {
        id: 'apply', target: 'project-qa-apply', path: '/projects/', optional: true, when: managesProjects,
        title: 'افزودن چک‌لیست QA',
        body: 'آیتم‌های کتابخانهٔ QA برای نقش‌هایی که انتخاب می‌کنید روی پروژه می‌نشینند و «اعمالِ چک‌لیست» ثبتشان می‌کند. آیتمِ تکراری دوباره اضافه نمی‌شود.',
      },
      {
        id: 'audience', target: 'project-qa-audience', path: '/projects/', optional: true, when: managesProjects,
        title: 'تیم یا کارفرما',
        body: 'هر نقشِ تیم آیتم‌های خودش را می‌گیرد. «کارفرما» آیتم‌هایی است که کارفرما خودش بررسی و تیک می‌زند و شما بازبینی می‌کنید.',
      },
      {
        id: 'views', target: 'project-qa-views', path: '/projects/', optional: true,
        title: 'تسک‌ها و چک‌لیست',
        body: '«تسک‌ها» کارهایی است که از چک‌لیست ساخته شده و «چک‌لیست» خودِ آیتم‌ها.',
      },
      {
        id: 'tasks', target: 'project-qa-tasks', path: '/projects/', optional: true,
        title: 'تسک‌های QA', body: 'بر اساسِ نقش دسته شده‌اند؛ با زدنِ نامِ هر تسک پنجره‌اش باز می‌شود.',
      },
      {
        id: 'view-checklist', target: 'project-qa-view-checklist', kind: 'click', path: '/projects/', optional: true,
        title: 'چک‌لیست', body: 'روی «چک‌لیست» بزنید.',
      },
      {
        id: 'list', target: 'project-qa-list', path: '/projects/', optional: true,
        title: 'آیتم‌ها',
        body: 'هر آیتم نشانِ نقشش یا «کارفرما» را دارد و زیرش روشِ بررسی آمده است. دکمهٔ تیک انجام‌شدن را ثبت می‌کند و نامِ تیک‌زننده کنارش می‌آید.',
      },
    ],
  },

  // ───────────────────────── بازبینی‌ها ─────────────────────────
  {
    id: 'projects-reviews',
    title: 'بازبینی‌ها',
    description: 'دیدنِ یک بازبینی، ویدئو، تصاویر و موردهایش.',
    audience: team,
    order: 28,
    next: ['projects-review-create'],
    steps: [
      ...openProject,
      {
        id: 'tab', target: 'project-tab-reviews', kind: 'click', path: '/projects/',
        title: 'تبِ «بازبینی‌ها»', body: 'روی «بازبینی‌ها» بزنید. اگر این تب را نمی‌بینید، از «بیشتر» در انتهای نوارِ تب بازش کنید.',
      },
      {
        id: 'list', target: 'project-reviews-list', path: '/projects/', optional: true,
        title: 'فهرستِ بازبینی‌ها',
        body: 'هر کارت یک بازبینی است (مثلاً ویدئوی لوم) با مخاطب، نشانِ «کارفرما می‌بیند» یا «پنهان از کارفرما» و نوارِ پیشرفتِ موردها.',
      },
      {
        id: 'card', target: 'project-reviews-card', kind: 'click', path: '/projects/', optional: true,
        title: 'باز کردنِ بازبینی', body: 'روی یکی از بازبینی‌ها بزنید.',
      },
      {
        id: 'media', target: 'project-review-media', path: '/projects/', optional: true,
        title: 'تصاویر و فایل‌ها',
        body: 'ویدئو بالای این بخش پخش می‌شود. مدیر تصویر را روی کادر رها می‌کند یا با Ctrl+V هر جای صفحه می‌چسباند.',
      },
      {
        id: 'progress', target: 'project-review-progress', path: '/projects/', optional: true,
        title: 'پیشرفت', body: 'چند مورد از کلِ موردهای این بازبینی انجام شده است.',
      },
      {
        id: 'add-item', target: 'project-review-add-item', kind: 'click', path: '/projects/', optional: true, when: managesProjects,
        title: 'افزودنِ مورد', body: 'روی «افزودنِ مورد» بزنید تا فرمش باز شود؛ هنوز چیزی ذخیره نمی‌شود.',
      },
      {
        id: 'item', target: 'project-review-item', path: '/projects/', optional: true, when: managesProjects,
        title: 'هر مورد یک تسک است',
        body: 'زمانِ شروع و پایان در ویدئو، بخش، عنوان، توضیح و اسکرین‌شات، اولویت و کسی یا نقشی که انجامش می‌دهد. دکمهٔ «افزودنِ مورد» ِ پایینِ فرم آن را به تسک تبدیل می‌کند.',
      },
      {
        id: 'item-hidden', target: 'project-review-item-hidden', path: '/projects/', optional: true, when: managesProjects,
        title: 'پنهان از کارفرما', body: 'اگر بازبینی برای کارفرما آشکار است، با این تیک فقط همین مورد را از او پنهان می‌کنید.',
      },
      {
        id: 'filter', target: 'project-review-filter', path: '/projects/', optional: true,
        title: 'همه، باز، انجام‌شده', body: 'موردها را بر اساسِ انجام‌شدن جدا کنید.',
      },
      {
        id: 'items', target: 'project-review-items', path: '/projects/', optional: true,
        title: 'موردها',
        body: 'با زدنِ زمانِ هر مورد ویدئو از همان لحظه پخش می‌شود و با زدنِ عنوانش پنجرهٔ تسک باز می‌شود.',
      },
      {
        id: 'back', target: 'project-review-back', kind: 'click', path: '/projects/', optional: true,
        title: 'برگشت', body: 'با «همهٔ بازبینی‌ها» به فهرست برگردید.',
      },
    ],
  },
  {
    id: 'projects-review-create',
    title: 'ساختنِ بازبینیِ تازه',
    description: 'ویدئو، مخاطب، پنهان از کارفرما، تصاویر و موردها.',
    audience: managesProjects,
    order: 29,
    steps: [
      ...openProject,
      {
        id: 'tab', target: 'project-tab-reviews', kind: 'click', path: '/projects/',
        title: 'تبِ «بازبینی‌ها»', body: 'روی «بازبینی‌ها» بزنید. اگر این تب را نمی‌بینید، از «بیشتر» در انتهای نوارِ تب بازش کنید.',
      },
      {
        id: 'new', target: 'project-reviews-new', kind: 'click', path: '/projects/',
        title: 'بازبینیِ تازه', body: 'روی «بازبینیِ تازه» بزنید تا پنجره‌اش باز شود.',
      },
      {
        id: 'title', target: 'project-review-title', path: '/projects/',
        title: 'عنوان', body: 'یک نامِ روشن بنویسید، مثلاً «بازبینیِ نسخهٔ موبایل».',
      },
      {
        id: 'video', target: 'project-review-video', path: '/projects/',
        title: 'ویدئو',
        body: 'پیوندِ لوم، یوتیوب یا ویمئو را بگذارید تا داخلِ صفحه پخش شود، یا با «بارگذاریِ ویدئو» فایلِ خودتان را انتخاب کنید.',
      },
      {
        id: 'audience', target: 'project-review-audience-field', path: '/projects/',
        title: 'مخاطب',
        body: '«کلِ تیمِ پروژه»، «نقش‌های خاص» یا «شخص یا اشخاصِ خاص». فقط مخاطبان و مدیرانِ پروژه بازبینی را می‌بینند.',
      },
      {
        id: 'client', target: 'project-review-client', path: '/projects/',
        title: 'نمایش به کارفرما',
        body: 'پیش‌فرض خاموش است: کارفرما نه این بازبینی را می‌بیند و نه تسک‌هایش را. فقط وقتی روشنش کنید کارفرما هم می‌بیند.',
      },
      {
        id: 'notes', target: 'project-review-notes', path: '/projects/',
        title: 'یادداشت', body: 'خلاصهٔ بررسی، پیوندِ فیگما یا متنِ پیامِ کارفرما را اینجا بنویسید.',
      },
      {
        id: 'images', target: 'project-review-images', path: '/projects/', optional: true,
        title: 'تصاویرِ بازبینی', body: 'اسکرین‌شات‌ها را روی کادر رها کنید، بچسبانید یا با کلیک انتخاب کنید.',
      },
      {
        id: 'save', target: 'project-review-save', path: '/projects/',
        title: 'مرحلهٔ دوم: موردها',
        body: 'با «بعدی: موردها» هر ایراد را یک مورد می‌نویسید که تسک می‌شود؛ در آخر «ساختِ بازبینی» همه را ثبت می‌کند. «انصراف» بی‌ذخیره می‌بندد.',
      },
    ],
  },

  // ───────────────────────── مالی ─────────────────────────
  {
    id: 'projects-money',
    title: 'تبِ مالیِ پروژه',
    description: 'قیمت، پرداخت‌ها و سهمِ شما — و اینکه هر کس چه می‌بیند.',
    audience: seesProjects,
    order: 30,
    steps: [
      ...openProject,
      {
        id: 'tab', target: 'project-tab-finance', kind: 'click', path: '/projects/',
        title: 'تبِ «مالی»', body: 'روی «مالی» بزنید. اگر این تب را نمی‌بینید، از «بیشتر» در انتهای نوارِ تب بازش کنید.',
      },
      {
        id: 'who', path: '/projects/',
        title: 'چه کسی چه می‌بیند',
        body: 'مالک، مدیرِ کلِ پروژه‌ها و حسابداری قیمت، تیم و تراکنش‌ها را می‌بینند. کارفرما قیمت و پرداخت‌های خودش را، و هر عضو فقط دستمزد و پرداخت‌های خودش را.',
      },
      {
        id: 'invoice', target: 'project-money-invoice', path: '/projects/', optional: true, when: seesProjectMoney,
        title: 'فاکتور', body: '«فاکتور» نسخهٔ چاپیِ صورت‌حساب را در صفحهٔ تازه باز می‌کند.',
      },
      {
        id: 'client', target: 'project-money-client', path: '/projects/', optional: true, when: seesProjectMoney,
        title: 'کارفرما', body: 'قیمتِ پروژه، آنچه کارفرما پرداخته، مانده و وضعیتِ پرداخت.',
      },
      {
        id: 'team', target: 'project-money-team', path: '/projects/', optional: true, when: seesProjectMoney,
        title: 'تیم', body: 'مبلغِ توافق‌شده با اعضا، آنچه به آن‌ها پرداخت شده و مانده، و زیرش ریزِ هر عضو.',
      },
      {
        id: 'transactions', target: 'project-money-transactions', path: '/projects/', optional: true, when: seesProjectMoney,
        title: 'تراکنش‌ها',
        body: 'هزینه‌ها و پرداخت‌های این پروژه با رسیدشان. ثبتِ آن‌ها از صفحهٔ «حسابداری» است.',
      },
      {
        id: 'my-summary', target: 'project-mymoney-summary', path: '/projects/', optional: true, when: (c) => c.isMember,
        title: 'پولِ من در این پروژه',
        body: 'مبلغِ توافقیِ شما، پرداخت‌شده، ماندهٔ قرارداد، درخواست‌های باز و آنچه هنوز می‌توانید درخواست کنید.',
      },
      {
        id: 'my-request', target: 'project-mymoney-request', path: '/projects/', optional: true, when: (c) => c.isMember,
        title: 'درخواستِ پرداخت',
        body: 'مبلغ و توضیح را بنویسید و «ثبتِ درخواست» را بزنید تا حسابداری ببیند. در پروژهٔ تعدادی کنارِ هر کارکرد «درخواست پرداخت» هست.',
      },
    ],
  },

  // ───────────────────────── تیم و ساعت، تنظیمات ─────────────────────────
  {
    id: 'projects-settings',
    title: 'تیم و ساعت، تنظیماتِ پروژه',
    description: 'در دسترس بودن، ساعت‌های کاری، کدِ پروژه، تلگرام و منطقهٔ خطر.',
    audience: managesProjects,
    order: 31,
    next: ['projects-tender'],
    steps: [
      ...openProject,
      {
        id: 'tab-team', target: 'project-tab-team', kind: 'click', path: '/projects/',
        title: 'تبِ «تیم و ساعت»', body: 'روی «تیم و ساعت» بزنید. اگر این تب را نمی‌بینید، از «بیشتر» در انتهای نوارِ تب بازش کنید.',
      },
      {
        id: 'availability', target: 'project-team-availability', path: '/projects/', optional: true,
        title: 'در دسترس بودن', body: 'اعضای پروژه کدام روزهای این هفته در دسترس‌اند یا مرخصی‌اند.',
      },
      {
        id: 'hours', target: 'project-team-hours', path: '/projects/', optional: true,
        title: 'ساعت کاریِ اعضا', body: 'جمعِ ساعت و تعدادِ ثبتِ هر عضو روی این پروژه، با مجموعِ کل در پایین.',
      },
      {
        id: 'logs', target: 'project-team-logs', path: '/projects/', optional: true,
        title: 'ریزِ ثبت‌ها', body: 'هر ثبتِ ساعت جدا، با فیلترِ تاریخ و عضو.',
      },
      {
        id: 'tab-manage', target: 'project-tab-manage', kind: 'click', path: '/projects/',
        title: 'تبِ «تنظیمات»', body: 'روی «تنظیمات» بزنید. اگر این تب را نمی‌بینید، از «بیشتر» در انتهای نوارِ تب بازش کنید.',
      },
      {
        id: 'code', target: 'project-settings-code', path: '/projects/', optional: true,
        title: 'کدِ پروژه', body: 'پیشوندِ شمارهٔ تسک‌های این پروژه را اینجا عوض می‌کنید.',
      },
      {
        id: 'telegram', target: 'project-settings-telegram', path: '/projects/', optional: true,
        title: 'گروهِ تلگرام', body: 'گروهِ تلگرامِ پروژه را وصل کنید تا اعضا با پیوندِ دعوت به آن بپیوندند.',
      },
      {
        id: 'danger', target: 'project-settings-danger', path: '/projects/', optional: true,
        title: 'منطقهٔ خطر',
        body: 'وضعیتِ داده‌های پروژه، «بایگانی کردن پروژه» (برگشت‌پذیر)، سبک‌سازی و حذف (فقط مالک). هر کدام پیش از اجرا تأیید می‌خواهد.',
      },
    ],
  },

  // ───────────────────────── مناقصه ─────────────────────────
  {
    id: 'projects-tender',
    title: 'مناقصه و پیشنهادِ قیمت',
    description: 'پیشنهاد دادن برای نقش‌ها و انتخابِ برنده.',
    audience: team,
    order: 32,
    steps: [
      ...openProject,
      {
        id: 'intro', path: '/projects/',
        title: 'پروژهٔ مناقصه‌ای',
        body: 'پروژه‌ای که روبانِ «مناقصه» دارد نقش‌هایی می‌خواهد که اعضا برایشان قیمت پیشنهاد می‌دهند و مدیر برنده را انتخاب می‌کند.',
      },
      {
        id: 'tab-my-bid', target: 'project-tab-my-bid', kind: 'click', path: '/projects/', optional: true,
        title: 'پیشنهادِ من', body: 'روی «پیشنهادِ من» بزنید.',
      },
      {
        id: 'my-bid', target: 'project-mybid', path: '/projects/', optional: true,
        title: 'قیمتِ پیشنهادیِ شما',
        body: 'برای هر نقش قیمتتان را جدا بنویسید و ثبت کنید. اگر برنده شوید همین‌جا خبرش را می‌بینید.',
      },
      {
        id: 'tab-bids', target: 'project-tab-bids', kind: 'click', path: '/projects/', optional: true, when: managesProjects,
        title: 'پیشنهادهای مناقصه', body: 'روی «پیشنهادهای مناقصه» بزنید.',
      },
      {
        id: 'bids', target: 'project-bids', path: '/projects/', optional: true, when: managesProjects,
        title: 'انتخابِ برنده',
        body: 'پیشنهادها با نقش و مبلغ. با «تأیید» برندهٔ هر نقش انتخاب و به پروژه اضافه می‌شود؛ پس از شروعِ کار برنده عوض نمی‌شود.',
      },
    ],
  },
];
