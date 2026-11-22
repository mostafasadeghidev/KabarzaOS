import { can, type Tour, type TourCtx, type TourStep } from '../types';

/**
 * راهنماهای بخشِ «welcome»: خوش‌آمدِ هر نقش (خودکار)، منوها، جستجو، کارت‌های داشبورد، چیدمانِ داشبورد
 * و درگاهِ کارفرما.
 *
 * ⚠️ هر کاربر دقیقاً با یک راهنمای خودکار جور می‌شود: `kindOf` نقش را به ترتیبِ اولویت می‌سنجد
 * (مالک ← کارفرمای خالص ← مالی ← مدیرِ تیم ← مدیرِ پروژه ← همکارِ ادمین ← عضو)، پس مخاطب‌ها هم‌پوشانی ندارند.
 * ⚠️ هیچ قدمِ «کلیک» روی دکمه‌ای که ذخیره، فرستادن، تأیید یا حذف می‌کند نیست؛ آن‌ها فقط توضیح داده می‌شوند.
 */

type Kind = 'owner' | 'client' | 'finance' | 'team' | 'pm' | 'admin' | 'member';

function kindOf(c: TourCtx): Kind {
  if (c.isOwner) return 'owner';
  if (c.isClientOnly) return 'client';
  if (c.roles.includes('finance') || (c.roles.includes('admin') && can(c, 'finance.manage'))) return 'finance';
  if (c.managesTeam) return 'team';
  if (c.isPm) return 'pm';
  if (c.roles.includes('admin')) return 'admin';
  return 'member';
}

/** «نمای کلی» دارد؟ مدیر (مجوزِ پروژه‌ها)، عضو، یا کارفرما. حسابدارِ خالص ندارد. */
const hasDash = (c: TourCtx) => can(c, 'projects.view') || c.isMember || c.roles.includes('client');
/** داشبوردِ مدیر (صفِ کارها) فقط با مجوزِ دیدنِ پروژه‌ها؛ بقیه داشبوردِ عضو یا کارفرما را می‌بینند. */
const adminDash = (c: TourCtx) => can(c, 'projects.view');
const memberDash = (c: TourCtx) => !adminDash(c) && c.isMember;
const teamLead = (c: TourCtx) => c.managesTeam || c.isPm;

/** متن‌های هر نقش برای قدم‌های مشترکِ خوش‌آمد. */
const TEXT: Record<Kind, { title: string; hello: string; helloBody: string; menu: string }> = {
  owner: {
    title: 'خوش‌آمد: مدیرِ کل',
    hello: 'سلام! به برنامه خوش آمدید',
    helloBody: 'شما مدیرِ کل هستید و همهٔ بخش‌ها را می‌بینید. در چند قدم با منو، جستجو، اعلان‌ها، منوی کاربر و داشبورد آشنا می‌شوید. هر وقت خواستید «بعداً» را بزنید.',
    menu: 'منو دو گروه دارد: «عملیات» برای کارِ روزمره (پروژه‌ها، تسک‌ها، جلسات، پیام‌ها) و «اطلاعات پایه» برای اعضا، کارفرمایان، مالی، گزارش‌ها و رویدادها. با زدنِ عنوانِ هر گروه جمع یا باز می‌شود.',
  },
  client: {
    title: 'خوش‌آمد: کارفرما',
    hello: 'سلام! به درگاهِ پروژه‌هایتان خوش آمدید',
    helloBody: 'اینجا پیشرفتِ پروژه‌هایتان را می‌بینید، کارهای تیم را تأیید می‌کنید، نظر و فایل می‌فرستید و صورت‌حسابتان را می‌بینید. در چند قدم با همه‌چیز آشنا می‌شوید.',
    menu: 'از این منو به «نمای کلی»، «پروژه‌ها»، «تسک‌ها»، «جلسات»، «پیام‌ها» و «امور مالی» (صورت‌حسابِ شما) می‌روید.',
  },
  finance: {
    title: 'خوش‌آمد: بخشِ مالی',
    hello: 'سلام! به بخشِ مالی خوش آمدید',
    helloBody: 'دفترِ حساب، پرداختِ اعضا، درخواست‌های پرداخت، حقوق، هزینه‌ها و طلب از کارفرماها همه در منوی «مالی» است. در چند قدم با منو، جستجو، اعلان‌ها و منوی کاربر آشنا می‌شوید.',
    menu: 'منو فقط بخش‌هایی را نشان می‌دهد که به شما سپرده شده؛ کارِ اصلیِ شما در «مالی» (گروهِ «اطلاعات پایه») است و اگر دسترسی دارید «گزارش‌ها» هم همان‌جاست.',
  },
  team: {
    title: 'خوش‌آمد: مدیرِ تیم',
    hello: 'سلام! به برنامه خوش آمدید',
    helloBody: 'شما مدیرِ تیم هستید: کارهای خودتان را دارید و کار، ساعت و مرخصیِ اعضای دفترتان را هم می‌بینید. در چند قدم با منو، جستجو، اعلان‌ها، منوی کاربر و داشبورد آشنا می‌شوید.',
    menu: 'در «عملیات» کارِ روزمرهٔ شماست؛ «تیمِ من» و «حضور و مرخصیِ تیم» مخصوصِ مدیرِ تیم‌اند. «برنامهٔ من» (برنامهٔ هفتگی و مرخصیِ خودتان) در «اطلاعات پایه» است.',
  },
  pm: {
    title: 'خوش‌آمد: مدیرِ پروژه',
    hello: 'سلام! به برنامه خوش آمدید',
    helloBody: 'شما مدیرِ پروژه هستید: روی پروژه‌هایتان تسک می‌سازید، کار را به اعضا می‌سپارید و کارهایی را که برای بررسی فرستاده‌اند تأیید یا برمی‌گردانید. در چند قدم با برنامه آشنا می‌شوید.',
    menu: 'در «عملیات» پروژه‌ها، تسک‌ها، جلسات، پیام‌ها و «ساعت کاری» است. «برنامهٔ من» (برنامهٔ هفتگی و مرخصیِ خودتان) در «اطلاعات پایه» است.',
  },
  admin: {
    title: 'خوش‌آمد: همکارِ ادمین',
    hello: 'سلام! به برنامه خوش آمدید',
    helloBody: 'شما همکارِ ادمین هستید و فقط بخش‌هایی را می‌بینید که مدیرِ کل به شما داده. در چند قدم با منو، جستجو، اعلان‌ها، منوی کاربر و داشبورد آشنا می‌شوید.',
    menu: 'منو فقط بخش‌هایی را دارد که به شما سپرده شده: کارِ روزمره در «عملیات» و اعضا، کارفرمایان، مالی یا گزارش‌ها (اگر دسترسی دارید) در «اطلاعات پایه».',
  },
  member: {
    title: 'خوش‌آمد: عضوِ تیم',
    hello: 'سلام! به تیم خوش آمدید',
    helloBody: 'کارهایتان، ثبتِ ساعت، پیام‌ها و پولِ شما همه از همین برنامه است. در چند قدم با منو، جستجو، اعلان‌ها، منوی کاربر و داشبورد آشنا می‌شوید.',
    menu: 'در «عملیات» پروژه‌ها، تسک‌ها، جلسات، پیام‌ها، «ساعت کاری» و «امور مالی» (پولِ شما) است. «برنامهٔ من» (برنامهٔ هفتگی و مرخصی) در «اطلاعات پایه» است.',
  },
};

/** قدم‌های مشترکِ خوش‌آمد — همه‌چیز جز متنِ نقش یکی است. */
function welcomeSteps(kind: Kind): TourStep[] {
  const x = TEXT[kind];
  return [
    { id: 'hello', title: x.hello, body: x.helloBody },
    { id: 'sidebar', target: 'sidebar-nav', optional: true, placement: 'start', title: 'منوی برنامه', body: x.menu },
    {
      id: 'search', target: 'topbar-search', title: 'جستجوی سراسری',
      body: 'از اینجا یا با Ctrl+K از هر صفحه، تسک (مثلاً #12)، پروژه، عضو، کارفرما یا صفحه‌ای را پیدا کنید و مستقیم بروید.',
    },
    {
      id: 'bell', target: 'topbar-notifications', kind: 'click', title: 'اعلان‌ها',
      body: 'عددِ روی زنگوله تعدادِ اعلان‌های خوانده‌نشده است. روی زنگوله بزنید تا فهرست باز شود.',
    },
    {
      id: 'bell-list', target: 'topbar-notifications-menu', optional: true, title: 'فهرستِ اعلان‌ها',
      body: 'اعلان‌های تازه اینجاست؛ با زدنِ هر کدام متنِ کاملش باز و خوانده می‌شود. «خواندنِ همه» همه را یک‌جا خوانده می‌کند.',
    },
    {
      id: 'bell-all', target: 'topbar-notifications-all', kind: 'click', advanceOnPath: '/notifications', title: 'همهٔ اعلان‌ها',
      body: 'زنگوله فقط تازه‌ها را دارد. روی «همهٔ اعلان‌ها» بزنید تا فهرستِ کامل، خوانده و نخوانده، باز شود.',
    },
    {
      id: 'user-menu', target: 'user-menu', kind: 'click', title: 'منوی کاربر',
      body: 'نام و نقشِ شما پایینِ منوست. روی آن بزنید تا ترجیح‌های شما و راهنماها باز شود.',
    },
    {
      id: 'locale', target: 'user-menu-locale', optional: true, title: 'زبان',
      body: 'زبانِ برنامه را از اینجا عوض کنید؛ صفحه یک بار تازه می‌شود و همه‌جا به زبانِ تازه می‌آید.',
    },
    {
      id: 'theme', target: 'user-menu-theme', optional: true, title: 'ظاهر و پالت',
      body: '«ظاهر» با هر بار زدن بینِ حالت روشن، تاریک و مطابق سیستم می‌چرخد. نقطه‌های رنگیِ «پالت» زیرش رنگِ اصلیِ برنامه را عوض می‌کنند.',
    },
    {
      id: 'hide-amounts', target: 'user-menu-hide-amounts', optional: true, title: 'پنهان‌کردنِ مبلغ‌ها',
      body: 'با روشن کردنِ «پنهان‌کردنِ مبلغ‌ها» همهٔ مبلغ‌ها پوشیده می‌شوند؛ وقتی کسی کنارتان است به کار می‌آید.',
    },
    {
      id: 'tours', target: 'user-menu-tours', optional: true, title: 'راهنمای برنامه',
      body: 'هر وقت خواستید این راهنما یا راهنمای بخش‌های دیگر را از «راهنمای برنامه» دوباره ببینید.',
    },
    {
      id: 'profile', target: 'user-menu-profile', kind: 'click', advanceOnPath: '/profile', optional: true, title: 'پروفایلِ من',
      body: 'حساب، رمزِ عبور، اعلان‌ها و اتصالِ تلگرام در «پروفایلِ من» است. رویش بزنید تا باز شود.',
    },
    // داشبورد — برای هر که «نمای کلی» دارد.
    {
      id: 'go-dash', target: 'nav-dashboard', kind: 'click', advanceOnPath: '/dashboard', when: hasDash, title: 'نمای کلی',
      body: 'حالا روی «نمای کلی» بزنید؛ صفحهٔ اولِ شما و هر روز اولین جایی که سر می‌زنید.',
    },
    {
      id: 'dash-admin', target: 'dashboard-grid', path: '/dashboard', when: adminDash, title: 'کارت‌های داشبورد',
      body: 'بالا کارهای منتظرِ تصمیمِ شماست (بازبینی‌ها، درخواست‌های پرداخت، اعضای بی‌ساعت) و پایین‌تر پول، پروژه‌های در خطر و تیم. علامتِ ؟ کنارِ عنوانِ هر کارت می‌گوید آن کارت چیست.',
    },
    {
      id: 'dash-member', target: 'dashboard-grid', path: '/dashboard', when: memberDash, title: 'کارت‌های داشبورد',
      body: 'اینجا کارهای شما، کارهای قابلِ برداشتن، کامنت‌های باز، ثبتِ ساعت و پروژه‌هایتان است. علامتِ ؟ کنارِ عنوانِ هر کارت می‌گوید آن کارت چیست.',
    },
    {
      id: 'dash-client', target: 'dashboard-grid', path: '/dashboard', when: (c) => !adminDash(c) && !c.isMember && c.roles.includes('client'), title: 'کارت‌های داشبورد',
      body: 'کارهای منتظرِ تأییدِ شما، پروژه‌ها با درصدِ پیشرفت، مرحلهٔ بعد، صورت‌حساب، فایل‌ها و راهِ پیام به تیم همه اینجاست.',
    },
    {
      id: 'dash-edit', target: 'dashboard-edit', path: '/dashboard', optional: true, when: hasDash, title: 'چیدمانِ داشبورد',
      body: 'با مداد کارت‌ها را جابه‌جا، کوچک و بزرگ یا پنهان می‌کنید. راهنمای «چیدمانِ داشبورد» قدم‌به‌قدم نشانتان می‌دهد.',
    },
    // حسابدارِ بی‌داشبورد — یکراست به «مالی».
    {
      id: 'go-finance', target: 'nav-finance', kind: 'click', advanceOnPath: '/finance', when: (c) => !hasDash(c) && can(c, 'finance.view'), title: 'مالی',
      body: 'حالا روی «مالی» بزنید؛ صفحهٔ اصلیِ کارِ شما با همهٔ زبانه‌های مالی.',
    },
  ];
}

/** «بعدی‌ها» ِ خوش‌آمدِ هر نقش (آنچه به مخاطبِ کاربر نخورد خودکار کنار می‌رود). */
const NEXT_STAFF = ['welcome-menu-work', 'welcome-menu-data', 'welcome-search', 'welcome-dash-admin', 'welcome-dash-member', 'welcome-layout'];
const NEXT_CLIENT = ['client-dashboard', 'client-approve', 'client-comment', 'welcome-search'];

const welcomeTour = (kind: Kind): Tour => ({
  id: `welcome-${kind}`,
  title: TEXT[kind].title,
  description: 'آشنایی با منو، جستجو، اعلان‌ها، منوی کاربر و داشبورد.',
  audience: (c) => kindOf(c) === kind,
  autoStart: true,
  order: 1,
  next: kind === 'client' ? NEXT_CLIENT : NEXT_STAFF,
  steps: welcomeSteps(kind),
});

/** قدمِ «برو به نمای کلی» — اگر کاربر همین حالا آنجاست، خودکار رد می‌شود. */
const goDash = (): TourStep => ({
  id: 'go-dash', target: 'nav-dashboard', kind: 'click', advanceOnPath: '/dashboard', title: 'نمای کلی',
  body: 'روی «نمای کلی» بزنید تا داشبوردِ شما باز شود.',
});

/** قدمِ توضیحِ یک کارتِ داشبورد (کارت ممکن است پنهان یا بی‌داده باشد، پس اختیاری). */
const card = (id: string, title: string, body: string, when?: (c: TourCtx) => boolean): TourStep => ({
  id: `card-${id}`, target: `dash-card-${id}`, path: '/dashboard', optional: true, title, body, ...(when ? { when } : {}),
});

const clientOnly = (c: TourCtx) => c.isClientOnly;

export const tours: Tour[] = [
  // ── خوش‌آمدِ هر نقش (خودکار؛ مخاطب‌ها هم‌پوشانی ندارند)
  welcomeTour('owner'),
  welcomeTour('client'),
  welcomeTour('finance'),
  welcomeTour('team'),
  welcomeTour('pm'),
  welcomeTour('admin'),
  welcomeTour('member'),

  // ── منوهای «عملیات»
  {
    id: 'welcome-menu-work',
    title: 'منوهای «عملیات»',
    description: 'هر منوی کارِ روزمره برای چیست.',
    audience: (c) => !c.isClientOnly,
    order: 2,
    next: ['welcome-menu-data'],
    steps: [
      { id: 'group', target: 'sidebar-group-operations', optional: true, placement: 'start', title: 'گروهِ «عملیات»', body: 'کارِ روزمره اینجاست. با زدنِ عنوانِ گروه جمع یا باز می‌شود و حالتش می‌ماند.' },
      { id: 'dashboard', target: 'nav-dashboard', optional: true, when: hasDash, title: 'نمای کلی', body: 'داشبوردِ شما: کارهای منتظر و خلاصهٔ همه‌چیز در یک صفحه. عددِ کهربایی کنارش یعنی چند کار منتظرِ شماست.' },
      { id: 'projects', target: 'nav-projects', optional: true, when: (c) => can(c, 'projects.view') || c.isMember, title: 'پروژه‌ها', body: 'فهرستِ پروژه‌ها با پیشرفت و وضعیت؛ هر پروژه تسک‌ها، کامنت‌ها، فایل‌ها، چک‌لیست و بازبینی‌های خودش را دارد.' },
      { id: 'tasks', target: 'nav-tasks', optional: true, when: (c) => can(c, 'projects.view') || c.isMember, title: 'تسک‌ها', body: 'همهٔ تسک‌های شما از همهٔ پروژه‌ها در یک جا: کارهای باز، منتظرِ بررسی و قابلِ برداشتن.' },
      { id: 'meetings', target: 'nav-meetings', optional: true, when: (c) => can(c, 'meetings.view') || c.isMember, title: 'جلسات', body: 'جلسه‌هایی که در آن‌ها هستید و یادآورهایتان؛ با پیوندِ پیوستن به جلسه.' },
      { id: 'messages', target: 'nav-messages', optional: true, when: (c) => can(c, 'messages.read') || can(c, 'messages.send') || c.isMember, title: 'پیام‌ها', body: 'پیامِ خصوصی، کانال‌های تیم و گروهِ هر پروژه. عددِ کنارش پیام‌های خوانده‌نشده است.' },
      { id: 'hours', target: 'nav-hours', optional: true, when: (c) => c.isMember || c.isOwner || c.managesTeam || c.roles.includes('finance'), title: 'ساعت کاری', body: 'تایمر را روی یک پروژه روشن کنید یا ساعتِ کار را دستی ثبت کنید.' },
      { id: 'my-money', target: 'nav-my-money', optional: true, when: (c) => c.isMember, title: 'امور مالی', body: 'پولِ خودِ شما: طلب از هر پروژه، پرداخت‌هایی که گرفته‌اید و درخواستِ پرداخت.' },
      { id: 'library', target: 'nav-library', optional: true, when: (c) => c.isOwner || c.isMember || c.roles.includes('admin'), title: 'کتابخانهٔ کد', body: 'تکه‌کدها و راهنماهای آمادهٔ تیم که روی هر پروژه نصب می‌شوند.' },
      { id: 'team', target: 'nav-team', optional: true, when: (c) => c.managesTeam, title: 'تیمِ من', body: 'اعضای دفترِ تحتِ مدیریتِ شما با کارها، ساعت و بارِ کاری‌شان.' },
      { id: 'availability', target: 'nav-availability', optional: true, when: (c) => can(c, 'members.view') || c.managesTeam, title: 'حضور و مرخصیِ تیم', body: 'چه کسی امروز سرِ کار است، برنامهٔ هفتگیِ اعضا و درخواست‌های مرخصی.' },
    ],
  },

  // ── منوهای «اطلاعات پایه»
  {
    id: 'welcome-menu-data',
    title: 'منوهای «اطلاعات پایه»',
    description: 'اعضا، کارفرمایان، مالی، گزارش‌ها و برنامهٔ شما.',
    audience: (c) => !c.isClientOnly && (c.isMember || can(c, 'members.view') || can(c, 'finance.view') || can(c, 'reports.view') || can(c, 'activity.view')),
    order: 3,
    next: ['welcome-search'],
    steps: [
      { id: 'group', target: 'sidebar-group-data', optional: true, placement: 'start', title: 'گروهِ «اطلاعات پایه»', body: 'پرونده‌ها و داده‌های پایه اینجاست؛ فقط منوهایی را می‌بینید که دسترسی‌شان را دارید.' },
      { id: 'members', target: 'nav-members', optional: true, when: (c) => can(c, 'members.view'), title: 'اعضا', body: 'پروندهٔ هر عضو: نقش‌ها، دفتر، پرداخت‌ها و دسترسی‌ها. افزودن و دعوتِ عضوِ تازه هم از همین‌جاست.' },
      { id: 'clients', target: 'nav-clients', optional: true, when: (c) => can(c, 'members.view') || c.managesTeam, title: 'کارفرمایان', body: 'کارفرماها با پروژه‌ها و حسابشان.' },
      { id: 'access', target: 'nav-access', optional: true, when: (c) => can(c, 'members.view'), title: 'دسترسی‌ها', body: 'دفترِ «چه کسی به چه سامانه‌ای دسترسی دارد»؛ برای وقتی کسی می‌آید یا می‌رود.' },
      { id: 'onboarding', target: 'nav-onboarding', optional: true, when: (c) => c.onboarding && can(c, 'members.view'), title: 'آنبوردینگ', body: 'چک‌لیستِ شروعِ همکاریِ اعضا و کارفرماهای تازه (اگر در تنظیمات روشن باشد).' },
      { id: 'finance', target: 'nav-finance', optional: true, when: (c) => can(c, 'finance.view'), title: 'مالی', body: 'دفترِ حساب، پرداختِ اعضا، درخواست‌های پرداخت، حقوق، هزینه‌ها و طلب از کارفرماها.' },
      { id: 'reports', target: 'nav-reports', optional: true, when: (c) => can(c, 'reports.view'), title: 'گزارش‌ها', body: 'گزارشِ پروژه‌ها، ساعت، سود و طلب‌ها با فیلترِ تاریخ و دفتر.' },
      { id: 'my-schedule', target: 'nav-my-schedule', optional: true, when: (c) => c.isMember || can(c, 'members.view') || can(c, 'activity.view'), title: 'برنامهٔ من', body: 'برنامهٔ هفتگیِ کارِ خودتان و درخواستِ مرخصی.' },
      { id: 'activity', target: 'nav-activity', optional: true, when: (c) => can(c, 'activity.view'), title: 'رویدادها', body: 'هر کاری که در برنامه انجام شده، با جزئیات و نامِ کسی که انجامش داده.' },
    ],
  },

  // ── جستجوی سراسری
  {
    id: 'welcome-search',
    title: 'جستجوی سراسری (Ctrl+K)',
    description: 'پیدا کردنِ تسک، پروژه، آدم یا صفحه از هر جا.',
    audience: () => true,
    order: 4,
    steps: [
      { id: 'open', target: 'topbar-search', kind: 'click', title: 'باز کردنِ جستجو', body: 'روی «جستجو» بزنید. از هر صفحه با Ctrl+K هم باز می‌شود.' },
      { id: 'help', target: 'topbar-search-help', optional: true, title: 'چه چیزی می‌شود جست؟', body: '# و شماره یک تسک را باز می‌کند (مثلاً #12)؛ کدِ پروژه و شماره (مثلاً ALZ-12) تسکِ همان پروژه را. برای پروژه، عضو، کارفرما یا حساب دستِ‌کم سه حرف بنویسید.' },
      { id: 'input', target: 'topbar-search-input', optional: true, title: 'نوشتن و رفتن', body: 'همین‌جا بنویسید؛ با کلیدهای بالا و پایین بینِ نتیجه‌ها بروید و با Enter باز کنید.' },
      { id: 'close', target: 'topbar-search-dialog', optional: true, title: 'بستن', body: 'با Esc یا ضربدر بسته می‌شود. حالا خودتان چیزی را جستجو کنید.' },
    ],
  },

  // ── کارت‌های داشبوردِ مدیر
  {
    id: 'welcome-dash-admin',
    title: 'کارت‌های «نمای کلی» (مدیر)',
    description: 'هر کارتِ داشبوردِ مدیر چه نشان می‌دهد.',
    audience: adminDash,
    order: 5,
    next: ['welcome-layout'],
    steps: [
      goDash(),
      card('inbox-projects', 'کارهای پروژه', 'تسک‌های در بازبینی، تسک‌های بی‌مسئول، مناقصه‌های با پیشنهادِ تازه و کامنت‌های بی‌پاسخ. دکمه‌های هر ردیف همان‌جا تأیید یا برمی‌گردانند؛ کلیدهای j و k بینِ ردیف‌ها می‌روند.'),
      card('inbox-finance', 'کارهای مالی', 'درخواست‌های پرداختِ اعضا برای تأیید یا رد، کارکردهای پرداخت‌نشده و هزینه‌های سررسیده.'),
      card('inbox-team', 'کارهای تیم', 'اعضایی که دیروز ساعتی ثبت نکرده‌اند؛ «یادآوری» برایشان اعلان می‌فرستد.'),
      card('money', 'پول در یک نگاه', 'طلب از کارفرماها، بدهی به اعضا و سودِ تخمینی. مبلغ‌ها پوشیده‌اند و با کلیک دیده می‌شوند.'),
      card('week', 'این هفتهٔ من', 'ددلاینِ پروژه‌ها و سررسیدِ تسک‌ها روز به روز؛ عقب‌افتاده‌ها قرمزند.'),
      card('risk', 'پروژه‌های در خطر', 'پروژه‌هایی که توجه می‌خواهند، با جدی‌ترین دلیل: ددلاینِ گذشته یا نزدیک، گیر در بازبینی یا راکد.'),
      card('team-today', 'تیمِ امروز', 'چند نفر آنلاین‌اند، چند تایمر روشن است و چه کسانی امروز مرخصی‌اند.'),
      card('capacity', 'ظرفیتِ تیم', 'نوارِ کهربایی تسک‌های باز و نوارِ آبی ساعتِ هفت روزِ اخیرِ هر عضو است؛ برای اینکه بدانید کار را به چه کسی بسپارید.'),
      card('client-waiting', 'کارفرماهای منتظرِ پاسخ', 'کامنت‌هایی که آخرین پیامشان از کارفرماست و هنوز کسی جواب نداده.'),
      card('a-receivables', 'طلب از کارفرماها', 'کارفرماهای بدهکار، بیشترین مانده اول و به تفکیکِ ارز.'),
      card('a-payroll', 'حقوق و قسط‌ها', 'حقوق‌ها و قسط‌های قرضی که موعدشان رسیده.'),
      card('a-qa', 'تیک‌های تازهٔ کارفرما', 'موردهای چک‌لیست که کارفرما تازه تیک زده و باید بررسی شوند.'),
      card('a-access', 'هشدارِ دسترسی', 'دسترسی‌هایی که باید پس گرفته یا بازبینی شوند.'),
      card('meetings', 'جلساتِ این هفته', 'جلسه‌های این هفته با روز و ساعت.'),
    ],
  },

  // ── کارت‌های داشبوردِ عضو (عضو، مدیرِ تیم، مدیرِ پروژه)
  {
    id: 'welcome-dash-member',
    title: 'کارت‌های «نمای کلی»',
    description: 'کارهای شما، ساعت، پروژه‌ها و کارت‌های مدیرِ تیم و پروژه.',
    audience: memberDash,
    order: 5,
    next: ['welcome-layout'],
    steps: [
      goDash(),
      card('m-tasks', 'کارهای من', 'تسک‌های بازِ شما؛ سررسیدگذشته‌ها اول و قرمزند و نزدیک‌ها کهربایی. با کلیک خودِ تسک همین‌جا باز می‌شود.'),
      card('m-claim', 'کارهای قابلِ برداشتن', 'تسک‌های بی‌مسئولی که نقشِ شما را می‌خواهند؛ با «برمی‌دارم» به نامِ شما می‌شوند.'),
      card('m-waiting', 'منتظرِ بررسی', 'کارهایی که برای بررسی فرستاده‌اید و منتظرِ تأییدِ مدیر یا کارفرما هستند.'),
      card('m-team-review', 'بازبینی‌های تیم', 'کارهایی که اعضا روی پروژه‌های شما برای بررسی فرستاده‌اند؛ بازشان کنید و تأیید کنید یا برگردانید.', teamLead),
      card('m-comments', 'کامنت‌های باز', 'گفتگوهای بازِ پروژه‌هایتان که هنوز بسته نشده‌اند.'),
      card('m-mentions', 'منشن‌های من', 'جاهایی که کسی با @ شما را صدا زده.'),
      card('m-week', 'این هفتهٔ من', 'سررسیدِ تسک‌ها و ددلاینِ پروژه‌هایتان تا هفت روزِ آینده.'),
      card('m-log', 'ثبتِ ساعت', 'تایمر را روی یک پروژه روشن کنید یا ساعت را دستی ثبت کنید. با تایمرِ روشن این کارت پنهان می‌شود.'),
      card('m-hours', 'هفتهٔ من', 'ساعتِ کارِ امروز و این هفته، با ستونِ هر روز.'),
      card('m-projects', 'پروژه‌های باز من', 'نقشِ شما، ددلاین، درصدِ پیشرفت، تسک‌های بازتان و ساعتی که روی هر پروژه کار کرده‌اید.'),
      card('m-tenders', 'مناقصه‌ها', 'پروژه‌هایی در مرحلهٔ مناقصه که با نقشِ شما جورند و می‌توانید پیشنهادِ قیمت بدهید.'),
      card('m-team', 'تیمِ من', 'خلاصهٔ دفترهایی که مدیرشان هستید.', (c) => c.managesTeam),
      card('m-leave', 'مرخصی و برنامهٔ من', 'برنامهٔ امروز و مرخصی‌های پیشِ روی شما.'),
    ],
  },

  // ── چیدمانِ داشبورد (همه)
  {
    id: 'welcome-layout',
    title: 'چیدمانِ داشبورد',
    description: 'جابه‌جا کردن، اندازه، قد، پنهان و افزودنِ کارت‌ها.',
    audience: hasDash,
    order: 6,
    steps: [
      goDash(),
      { id: 'edit', target: 'dashboard-edit', kind: 'click', path: '/dashboard', title: 'ویرایشِ چیدمان', body: 'روی مداد بزنید تا حالتِ ویرایش باز شود. چیدمان فقط برای خودتان است و روی هر دستگاهی یکی است.' },
      { id: 'bar', target: 'dashboard-edit-bar', path: '/dashboard', title: 'حالتِ ویرایش', body: 'دورِ کارت‌ها خطِ‌چین می‌آید. موس را روی کارت ببرید: از دستگیره بکشید تا جابه‌جا شود؛ لبهٔ پایین قد را و لبهٔ بالا شروع را عوض می‌کند.' },
      { id: 'select', target: 'dashboard-card', kind: 'click', path: '/dashboard', title: 'انتخابِ کارت', body: 'روی یک کارت بزنید تا نوارِ ابزارش بالای آن بماند.' },
      { id: 'toolbar', target: 'dashboard-card-toolbar', path: '/dashboard', optional: true, title: 'نوارِ کارت', body: 'دستگیره برای کشیدن، و پیکان‌ها برای بردنِ کارت به ستونِ قبلی یا بعدی و بالاتر یا پایین‌تر.' },
      { id: 'sizes', target: 'dashboard-card-sizes', path: '/dashboard', optional: true, title: 'اندازهٔ کارت', body: 'پهنای کارت: ¼ یک‌چهارم، ⅓ یک‌سوم، ½ نصف، ¾ سه‌چهارم و 1 تمام‌عرض.' },
      { id: 'height', target: 'dashboard-card-height', path: '/dashboard', optional: true, title: 'قدِ کارت', body: 'این دستگیره را بکشید تا قدِ کارت عوض شود و به لبهٔ کارت‌های کناری بچسبد؛ دوبار کلیک قد را خودکار می‌کند.' },
      { id: 'hide', target: 'dashboard-card-hide', path: '/dashboard', optional: true, title: 'پنهان کردن', body: 'با چشمِ خط‌خورده کارت پنهان می‌شود؛ هر وقت خواستید برش می‌گردانید.' },
      { id: 'add', target: 'dashboard-add-card', path: '/dashboard', optional: true, title: 'افزودنِ کارت', body: 'کارت‌های پنهان اینجا هستند؛ با یک کلیک دوباره روی داشبورد می‌آیند.' },
      { id: 'list', target: 'dashboard-cards-list', kind: 'click', path: '/dashboard', title: 'فهرستِ کارت‌ها', body: 'روی «فهرستِ کارت‌ها» بزنید تا همهٔ کارت‌ها یک‌جا باز شوند.' },
      { id: 'dialog', target: 'dashboard-cards-dialog', path: '/dashboard', title: 'سفارشی‌سازیِ داشبورد', body: 'هر کارت را با تیک روشن یا خاموش کنید، اندازه‌اش را از فهرست بگذارید و با پیکان‌ها بالا و پایین ببرید.' },
      { id: 'dialog-close', target: 'dashboard-cards-close', kind: 'click', path: '/dashboard', title: 'بستنِ فهرست', body: 'تغییرها همان لحظه ذخیره می‌شوند. روی «تمام» بزنید تا پنجره بسته شود.' },
      { id: 'reset', target: 'dashboard-reset', path: '/dashboard', optional: true, title: 'پیش‌فرض', body: 'اگر چیدمان به هم ریخت، «پیش‌فرض» همه‌چیز را به چیدمانِ اول برمی‌گرداند.' },
      { id: 'done', target: 'dashboard-edit-done', kind: 'click', path: '/dashboard', title: 'تمام', body: 'روی تیک بزنید تا از حالتِ ویرایش بیرون بیایید.' },
    ],
  },

  // ── درگاهِ کارفرما
  {
    id: 'client-dashboard',
    title: 'کارت‌های داشبوردِ شما',
    description: 'هر کارتِ داشبوردِ کارفرما چه نشان می‌دهد.',
    audience: clientOnly,
    order: 2,
    next: ['client-approve', 'client-todos', 'client-comment', 'client-message', 'client-projects', 'client-checklist', 'welcome-layout'],
    steps: [
      goDash(),
      card('c-review', 'منتظرِ تأییدِ شما', 'کارهایی که تیم تمام کرده و برای دیدن و تأییدِ شما فرستاده. با کلیک تسک همین‌جا باز می‌شود.'),
      card('c-assigned', 'کارهای شما', 'کارهایی که تیم به خودِ شما سپرده، مثلاً تأییدِ متن، فرستادنِ محتوا یا امضا. سررسیدگذشته قرمز است.'),
      card('c-qa', 'چک‌لیستِ تحویل', 'موردهایی از چک‌لیستِ کیفیت که خودتان باید ببینید و اگر درست بود تیک بزنید.'),
      card('c-projects', 'پروژه‌های من', 'هر پروژه با مرحلهٔ فعلی، ددلاین، نوارِ پیشرفت (بر اساسِ تسک‌ها) و وضعیتِ پرداخت.'),
      card('c-stage', 'مرحلهٔ بعد', 'هر پروژه الان کجاست، قدمِ بعدی چیست و تا ددلاین چند روز مانده.'),
      card('c-statement', 'صورتِ حساب', 'برای هر پروژه ماندهٔ پرداخت و تاریخِ آخرین پرداخت. مبلغ‌ها پوشیده‌اند و با کلیک دیده می‌شوند.'),
      card('c-files', 'فایل‌های پروژه', 'فایل‌های تحویلی و مهم؛ سنجاق‌شده‌ها بالاترند و با کلیک دانلود می‌شوند.'),
      card('c-updates', 'تازه‌های پروژه', 'کارهایی که در ۳۰ روزِ اخیر تمام شده و فایل‌های تازه.'),
      card('c-comment', 'نظر روی پروژه', 'نظر، سؤال یا درخواستتان را با فایل مستقیم روی یکی از پروژه‌ها بنویسید.'),
      card('c-message', 'پیام به تیم', 'سؤالتان را برای مدیرانِ تیم بفرستید؛ پاسخ در «پیام‌ها» می‌آید.'),
      card('c-meetings', 'جلساتِ پیشِ رو', 'جلسه‌های هفت روزِ آینده با تیم.'),
    ],
  },
  {
    id: 'client-approve',
    title: 'تأییدِ کارِ تیم',
    description: 'دیدنِ کارِ تمام‌شده، نوشتنِ نظر و تأیید.',
    audience: clientOnly,
    order: 3,
    next: ['client-todos'],
    steps: [
      goDash(),
      card('c-review', 'منتظرِ تأییدِ شما', 'هر ردیف کاری است که تیم برای دیدنِ شما فرستاده. اگر خالی است، فعلاً کاری منتظرِ شما نیست.'),
      { id: 'open', target: 'dash-client-review-item', kind: 'click', path: '/dashboard', optional: true, title: 'باز کردنِ کار', body: 'روی یک کار بزنید تا پنجرهٔ تسک همین‌جا باز شود.' },
      { id: 'dialog', target: 'task-dialog', optional: true, title: 'پنجرهٔ تسک', body: 'شرح، فایل‌ها و گفتگوی این کار اینجاست. کار را با دقت ببینید.' },
      { id: 'status', target: 'task-status', optional: true, title: 'وضعیت', body: 'اگر کار درست است وضعیت را به مرحلهٔ تأیید ببرید؛ این کار همان لحظه ذخیره می‌شود.' },
      { id: 'note', target: 'task-note-input', optional: true, title: 'نوشتنِ نظر', body: 'اگر چیزی باید عوض شود همین‌جا بنویسید. عکس را با Ctrl+V بچسبانید یا فایل پیوست کنید.' },
      { id: 'send', target: 'task-note-send', optional: true, title: 'فرستادن', body: 'با این دکمه نظرتان برای تیم فرستاده می‌شود. پنجره را با ضربدر ببندید.' },
    ],
  },
  {
    id: 'client-todos',
    title: 'کارهایی که به شما سپرده شده',
    description: 'دیدن و انجامِ کارهایی که تیم به خودتان داده.',
    audience: clientOnly,
    order: 4,
    steps: [
      goDash(),
      card('c-assigned', 'کارهای شما', 'تیم گاهی کاری به خودِ شما می‌سپارد: تأییدِ متن، فرستادنِ محتوا یا امضا. این کارت فقط وقتی کاری دارید دیده می‌شود.'),
      { id: 'open', target: 'dash-client-assigned-item', kind: 'click', path: '/dashboard', optional: true, title: 'باز کردنِ کار', body: 'روی کار بزنید تا پنجرهٔ تسک باز شود.' },
      { id: 'dialog', target: 'task-dialog', optional: true, title: 'شرحِ کار', body: 'اینجا می‌خوانید تیم دقیقاً چه چیزی از شما می‌خواهد و تا کی.' },
      { id: 'note', target: 'task-note-input', optional: true, title: 'جواب و فایل', body: 'جواب یا فایلِ خواسته‌شده را همین‌جا بنویسید و پیوست کنید؛ عکس را با Ctrl+V هم می‌شود چسباند.' },
      { id: 'status', target: 'task-status', optional: true, title: 'تمام شد', body: 'وقتی کارتان تمام شد، وضعیت را عوض کنید تا تیم خبردار شود.' },
    ],
  },
  {
    id: 'client-comment',
    title: 'نظر روی پروژه، با فایل',
    description: 'نوشتنِ نظر یا درخواست روی یک پروژه و پیوستِ فایل.',
    audience: clientOnly,
    order: 5,
    next: ['client-message'],
    steps: [
      goDash(),
      card('c-comment', 'نظر روی پروژه', 'نظرتان همان کامنتِ پروژه می‌شود و تیم آن را در تبِ کامنت‌های پروژه می‌بیند.'),
      { id: 'project', target: 'dash-client-comment', path: '/dashboard', optional: true, title: 'انتخابِ پروژه', body: 'اگر چند پروژه دارید، بالای کارت پروژه را با جستجو انتخاب کنید. گفتگوهای اخیرِ همان پروژه زیرش می‌آید.' },
      { id: 'input', target: 'dash-client-comment-input', path: '/dashboard', optional: true, title: 'متنِ نظر', body: 'نظر، سؤال یا درخواستتان را اینجا بنویسید.' },
      { id: 'attach', target: 'dash-client-comment-attach', path: '/dashboard', optional: true, title: 'پیوستِ فایل', body: 'با «پیوستِ فایل» یک یا چند عکس یا فایل کنارِ نظرتان بگذارید.' },
      { id: 'send', target: 'dash-client-comment-send', path: '/dashboard', optional: true, title: 'بفرست', body: 'با «بفرست» نظرتان روی پروژه ثبت می‌شود و تیم خبردار می‌شود.' },
    ],
  },
  {
    id: 'client-message',
    title: 'پیام به تیم',
    description: 'فرستادنِ سؤال برای مدیرانِ تیم و دیدنِ پاسخ.',
    audience: clientOnly,
    order: 6,
    steps: [
      goDash(),
      card('c-message', 'پیام به تیم', 'برای سؤالی که به پروژهٔ خاصی ربط ندارد؛ مستقیم به مدیرانِ تیم می‌رسد.'),
      { id: 'input', target: 'dash-client-message-input', path: '/dashboard', optional: true, title: 'متنِ پیام', body: 'سؤال یا درخواستتان را اینجا بنویسید.' },
      { id: 'send', target: 'dash-client-message-send', path: '/dashboard', optional: true, title: 'بفرست', body: 'با «بفرست» پیام فرستاده می‌شود.' },
      { id: 'messages', target: 'nav-messages', kind: 'click', advanceOnPath: '/messages', title: 'پیام‌ها', body: 'پاسخِ تیم در «پیام‌ها» می‌آید. رویش بزنید تا ببینید.' },
    ],
  },
  {
    id: 'client-projects',
    title: 'پیشرفت، مرحله و صورت‌حساب',
    description: 'پروژه‌هایتان کجا هستند و چقدر پرداخت شده.',
    audience: clientOnly,
    order: 7,
    steps: [
      goDash(),
      card('c-projects', 'پروژه‌های من', 'هر کارت یک پروژه است با مرحلهٔ فعلی و ددلاین.'),
      { id: 'progress', target: 'dash-client-progress', path: '/dashboard', optional: true, title: 'نوارِ پیشرفت', body: 'درصدِ پیشرفت از تسک‌های تمام‌شده می‌آید. برچسبِ زیرش وضعیتِ پرداخت است: پرداخت‌نشده، پرداختِ جزئی یا تسویه‌شده.' },
      card('c-stage', 'مرحلهٔ بعد', 'مرحلهٔ فعلی، قدمِ بعدی و روزهای مانده تا ددلاین؛ گذشته قرمز و نزدیک کهربایی است.'),
      card('c-statement', 'صورتِ حساب', 'ماندهٔ هر پروژه؛ «جزئیات» شما را به «امور مالی» می‌برد.'),
      card('c-files', 'فایل‌های پروژه', 'فایل‌ها را همین‌جا دانلود کنید یا با زدنِ نامِ پروژه به تبِ فایل‌ها بروید.'),
      { id: 'open', target: 'dash-client-project', kind: 'click', path: '/dashboard', advanceOnPath: '/projects/', optional: true, title: 'باز کردنِ پروژه', body: 'روی یک پروژه بزنید تا صفحه‌اش با تسک‌ها، کامنت‌ها و فایل‌ها باز شود.' },
      { id: 'tabs', target: 'project-tabs', path: '/projects/', optional: true, title: 'تب‌های پروژه', body: 'هر بخشِ پروژه یک تب دارد؛ با زدنِ هر تب همان بخش باز می‌شود.' },
    ],
  },
  {
    id: 'client-checklist',
    title: 'چک‌لیستِ تحویل',
    description: 'بررسی و تیک زدنِ موردهای کیفیت پیش از تحویل.',
    audience: clientOnly,
    order: 8,
    steps: [
      goDash(),
      card('c-qa', 'چک‌لیستِ تحویل', 'این کارت فقط وقتی موردی برای بررسیِ شما هست دیده می‌شود.'),
      { id: 'tick', target: 'dash-client-qa-tick', path: '/dashboard', optional: true, title: 'تیک زدن', body: 'هر مورد را ببینید؛ اگر درست بود این مربع را بزنید. تیک همان لحظه ثبت می‌شود و تیم بررسی‌اش می‌کند.' },
      { id: 'project', target: 'dash-client-qa-project', kind: 'click', path: '/dashboard', advanceOnPath: '/projects/', optional: true, title: 'چک‌لیستِ کامل', body: 'روی نامِ پروژه بزنید تا چک‌لیستِ کاملِ آن پروژه باز شود.' },
      { id: 'qa-tab', target: 'project-tab-qa', path: '/projects/', optional: true, title: 'تبِ چک‌لیست', body: 'همهٔ موردهای چک‌لیستِ این پروژه اینجاست؛ موردهای شما جدا از موردهای تیم‌اند.' },
    ],
  },
];
