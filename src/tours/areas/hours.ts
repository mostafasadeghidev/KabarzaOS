import { can, type Tour, type TourCtx } from '../types';

/**
 * راهنماهای بخشِ «شخصی» — ساعتِ کاری، برنامهٔ من، امورِ مالیِ من، پروفایل و اعلان‌ها.
 *
 * ⚠️ هیچ قدمِ «کلیک» روی دکمه‌ای که ذخیره/ثبت/حذف می‌کند نیست؛ آن‌ها با قدمِ «دیدن» توضیح داده
 * می‌شوند. کلیک فقط برای باز کردنِ صفحه، تب یا ردیفِ بازشو است.
 */

/** هر که «ساعت کاری» را در منو دارد (پورتِ `canUseTimesheet`: عضو، مالک، مالی، مدیرِ دفتر). */
const usesHours = (c: TourCtx) =>
  !c.isClientOnly && (c.isMember || c.isOwner || c.managesTeam || c.roles.includes('finance'));

/** «برنامهٔ من» در منو: عضو، یا دارندهٔ مجوزِ رویدادها یا اعضا. */
const usesSchedule = (c: TourCtx) =>
  !c.isClientOnly && (c.isMember || can(c, 'activity.view') || can(c, 'members.view'));

const isClient = (c: TourCtx) => c.roles.includes('client');

export const tours: Tour[] = [
  // ─────────────── ساعتِ کاری: تایمر و ثبتِ دستی ───────────────
  {
    id: 'personal-hours-log',
    title: 'ثبتِ ساعتِ کاری',
    description: 'تایمر را روشن و خاموش کنید یا ساعت را دستی ثبت کنید.',
    audience: usesHours,
    order: 40,
    next: ['personal-hours-history'],
    steps: [
      {
        id: 'nav', target: 'nav-hours', kind: 'click', advanceOnPath: '/hours', optional: true,
        title: 'منوی «ساعت کاری»',
        body: 'روی «ساعت کاری» بزنید تا صفحهٔ ثبتِ ساعت باز شود.',
      },
      {
        id: 'summary', target: 'hours-summary', path: '/hours',
        title: 'تایمر و جمعِ ساعت‌ها',
        body: 'بالای صفحه تایمر است و کنارش جمعِ ساعت‌های «این هفته» و «این ماه». تایمر روی سرور می‌شمارد؛ بستنِ مرورگر چیزی را از بین نمی‌برد.',
      },
      {
        id: 'start', target: 'hours-timer-start', path: '/hours', optional: true,
        title: 'شروعِ تایمر',
        body: 'از «پروژه» کاری را که رویش هستید انتخاب کنید و «شروع» را بزنید. اگر اجازه دارید، «بدون پروژه (کارِ عمومی)» هم در فهرست هست.',
      },
      {
        id: 'stop', target: 'hours-timer-stop', path: '/hours', optional: true,
        title: 'توقف و ثبت',
        body: 'وقتی تایمر روشن است، زمانِ شمرده‌شده و نامِ پروژه اینجا دیده می‌شود. در «توضیح (اختیاری)» بنویسید روی چه کار کردید و «توقف و ثبت» را بزنید.',
      },
      {
        id: 'pending', target: 'hours-pending', path: '/hours', optional: true,
        title: 'تایمرِ طولانی',
        body: 'اگر تایمر بیش از ۵ ساعت روشن مانده باشد، خودکار ثبت نمی‌شود. مدت را اصلاح و «ثبتِ این مدت» را بزنید، یا «ادامهٔ تایمر» یا «دور بینداز» را انتخاب کنید.',
      },
      {
        id: 'manual', target: 'hours-manual', path: '/hours', optional: true,
        title: 'ثبتِ دستی',
        body: 'اگر تایمر را روشن نکرده بودید، ساعت را همین‌جا دستی ثبت کنید؛ برای روزهای گذشته هم کار می‌کند.',
      },
      {
        id: 'project', target: 'hours-manual-project', path: '/hours', optional: true,
        title: 'انتخابِ پروژه',
        body: 'پروژه را جستجو و انتخاب کنید. اگر روی پروژهٔ تعدادی ردیفِ کارکردِ نام‌دار دارید، به شکلِ «پروژه - نامِ ردیف» هم در فهرست می‌آید تا ساعت به همان ردیف بخورد.',
      },
      {
        id: 'time', target: 'hours-manual-time', path: '/hours', optional: true,
        title: 'تاریخ و مدت',
        body: '«تاریخ» را انتخاب کنید و مدت را با «ساعت» و «دقیقه» بنویسید. در «توضیح» هم کوتاه بگویید چه کردید.',
      },
      {
        id: 'save', path: '/hours',
        title: 'دکمهٔ «ثبت»',
        body: 'با زدنِ «ثبت» ساعت ذخیره می‌شود. ثبتِ همان روز و همان پروژه با ثبتِ قبلی یکی می‌شود و ساعت‌ها تا ۲ هفته قابلِ ویرایش‌اند.',
      },
      {
        id: 'units',
        title: 'کارِ تعدادی',
        body: 'اگر دستمزدِ شما تعدادی است (مثلاً به ازای هر صفحه یا هر ویدیو)، تعداد را در صفحهٔ پروژه، تبِ «مالی»، بخشِ «کارکردها» ثبت کنید. ساعت کاری جدا از آن است.',
      },
    ],
  },

  // ─────────────── ساعتِ کاری: فهرست، فیلتر و ویرایش ───────────────
  {
    id: 'personal-hours-history',
    title: 'ساعت‌های ثبت‌شده',
    description: 'فیلتر کردن، دیدن و ویرایشِ ساعت‌هایی که ثبت کرده‌اید.',
    audience: usesHours,
    order: 41,
    next: ['personal-schedule'],
    steps: [
      {
        id: 'nav', target: 'nav-hours', kind: 'click', advanceOnPath: '/hours', optional: true,
        title: 'منوی «ساعت کاری»',
        body: 'روی «ساعت کاری» بزنید تا فهرستِ ساعت‌هایتان را ببینید.',
      },
      {
        id: 'filter', target: 'hours-filter', path: '/hours',
        title: 'فیلترِ ساعت‌ها',
        body: 'با «از تاریخ»، «تا تاریخ» و نامِ پروژه فهرست را محدود کنید و «فیلتر» را بزنید. وقتی فیلتر روشن است، «مجموع در این بازه» زیرش نشان داده می‌شود و «پاک‌کردن» همه را برمی‌گرداند.',
      },
      {
        id: 'list', target: 'hours-list', path: '/hours', optional: true,
        title: 'فهرستِ ثبت‌ها',
        body: 'هر ردیف تاریخ و روزِ هفته، پروژه (یا «عمومی»)، توضیح و مدت را نشان می‌دهد. فهرست ۱۵تایی صفحه‌بندی شده است.',
      },
      {
        id: 'edit', target: 'hours-edit', kind: 'click', path: '/hours', optional: true,
        title: 'ویرایشِ یک ثبت',
        body: 'روی مدادِ یک ردیف بزنید تا فرمِ ویرایشش باز شود.',
      },
      {
        id: 'edit-form', target: 'hours-edit-form', path: '/hours', optional: true,
        title: 'فرمِ ویرایش',
        body: 'تاریخ، پروژه، ساعت، دقیقه یا توضیح را عوض کنید و «ذخیره» را بزنید؛ برای انصراف «بستن» را بزنید.',
      },
      {
        id: 'lock', path: '/hours',
        title: 'حذف و قفل',
        body: 'با سطلِ کنارِ هر ردیف یک ثبت حذف می‌شود (پیش از حذف تأیید می‌خواهد). ثبت‌های قدیمی‌تر از ۲ هفته «قفل‌شده» هستند و دیگر عوض نمی‌شوند.',
      },
    ],
  },

  // ─────────────── برنامهٔ من: روزهای کاری و مرخصی ───────────────
  {
    id: 'personal-schedule',
    title: 'برنامهٔ هفتگی و مرخصی',
    description: 'روزها و ساعت‌های کاری‌تان را بگذارید و مرخصی ثبت کنید.',
    audience: usesSchedule,
    order: 42,
    next: ['personal-money-member'],
    steps: [
      {
        id: 'nav', target: 'nav-my-schedule', kind: 'click', advanceOnPath: '/my-schedule', optional: true,
        title: 'منوی «برنامهٔ من»',
        body: 'روی «برنامهٔ من» بزنید تا برنامهٔ هفتگی و مرخصی‌هایتان باز شود.',
      },
      {
        id: 'week', target: 'schedule-week', path: '/my-schedule',
        title: 'برنامهٔ هفتگیِ من',
        body: 'اینجا روزهایی را که معمولاً کار می‌کنید مشخص می‌کنید. مدیرِ تیم همین را در نمای تیم می‌بیند و جلسه‌ها و کارها را با آن هماهنگ می‌کند.',
      },
      {
        id: 'days', target: 'schedule-week', path: '/my-schedule',
        title: 'روزها و بازهٔ ساعتی',
        body: 'کنارِ هر روزِ کاری تیک بزنید. اگر فقط چند ساعت در دسترسید، «بازهٔ ساعتی» را بزنید و ساعتِ شروع و پایان را بنویسید؛ بدونِ بازه یعنی تمامِ روز.',
      },
      {
        id: 'save-week', target: 'schedule-week', path: '/my-schedule',
        title: 'ذخیرهٔ برنامه',
        body: 'پس از تغییر، دکمهٔ «ذخیرهٔ برنامه» را در پایینِ همین بخش بزنید تا برنامه ثبت شود.',
      },
      {
        id: 'leave', target: 'schedule-leave', path: '/my-schedule',
        title: 'ثبتِ مرخصی',
        body: 'برای مرخصی «از تاریخ» و «تا تاریخ» را انتخاب کنید، اگر خواستید توضیح بنویسید و «ثبتِ مرخصی» را بزنید. بازه‌ای که با مرخصیِ قبلی هم‌پوشانی دارد با آن یکی می‌شود.',
      },
      {
        id: 'leave-list', target: 'schedule-leave', path: '/my-schedule',
        title: 'مرخصی‌های من',
        body: 'زیرِ فرم، فهرستِ مرخصی‌های پیشِ رو را می‌بینید. با دکمهٔ حذفِ کنارِ هر ردیف می‌توانید مرخصی‌ای را که لغو شده پاک کنید.',
      },
      {
        id: 'team', target: 'nav-availability', optional: true,
        when: (c) => c.managesTeam || can(c, 'members.view'),
        title: 'حضور و مرخصیِ تیم',
        body: 'شما که مدیرِ تیم هستید، برنامه و مرخصیِ همهٔ اعضا را در «حضور و مرخصیِ تیم» می‌بینید و می‌توانید برای آنها مرخصی ثبت کنید.',
      },
    ],
  },

  // ─────────────── امورِ مالیِ من (عضو) ───────────────
  {
    id: 'personal-money-member',
    title: 'دریافتی‌های من',
    description: 'ببینید از هر پروژه چقدر طلب دارید، چه گرفته‌اید و رسیدها کجاست.',
    audience: (c) => c.isMember,
    order: 43,
    next: ['personal-money-request', 'personal-profile'],
    steps: [
      {
        id: 'nav', target: 'nav-my-money', kind: 'click', advanceOnPath: '/my-money', optional: true,
        title: 'منوی «امور مالی»',
        body: 'روی «امور مالی» بزنید تا خلاصهٔ مالیِ خودتان روی همهٔ پروژه‌ها باز شود.',
      },
      {
        id: 'list', target: 'money-member-list', path: '/my-money', optional: true,
        title: 'دریافتی‌های شما (عضوِ تیم)',
        body: 'برای هر پروژه‌ای که در آن کار کرده‌اید یک ردیف هست. وضعیتِ کنارِ نام می‌گوید «پرداخت‌نشده»، «پرداختِ جزئی» یا «تسویه‌شده» است.',
      },
      {
        id: 'chips', target: 'money-row-chips', path: '/my-money', optional: true,
        title: 'مبلغ‌های هر پروژه',
        body: '«مبلغِ قرارداد» سهمِ شما از پروژه است، «پرداختی» آنچه گرفته‌اید و «مانده» آنچه هنوز طلب دارید. در پروژهٔ تعدادی «پرداختی» و «پرداخت‌نشده» می‌بینید.',
      },
      {
        id: 'open', target: 'money-row-toggle', kind: 'click', path: '/my-money', optional: true,
        title: 'باز کردنِ جزئیات',
        body: 'روی نامِ پروژه بزنید تا ریزِ پرداخت‌ها باز شود.',
      },
      {
        id: 'details', target: 'money-row-details', path: '/my-money', optional: true,
        title: 'پرداختی‌ها و رسیدها',
        body: 'در «پرداختی‌های شما» تاریخ، مبلغ و توضیحِ هر پرداخت هست و با «مشاهده» تصویرِ رسید باز می‌شود. اگر درخواستِ پرداخت داده باشید، وضعیتش هم همین‌جاست.',
      },
      {
        id: 'request', target: 'money-row-link', path: '/my-money', optional: true,
        title: 'درخواست پرداخت',
        body: 'دکمهٔ «درخواست پرداخت» شما را به تبِ «مالی» ِ همان پروژه می‌برد تا تا سقفِ ماندهٔ خودتان درخواست ثبت کنید.',
      },
      {
        id: 'bank', target: 'money-bank-link', path: '/my-money', optional: true,
        title: 'حسابِ بانکی',
        body: 'پول به حسابی واریز می‌شود که در پروفایل ثبت کرده‌اید. با «اطلاعاتِ حسابِ بانکی» آن را ببینید یا اصلاح کنید.',
      },
      {
        id: 'salary', target: 'money-salary', path: '/my-money', optional: true,
        title: 'حقوقِ ماهانه',
        body: 'اگر حقوقِ ثابت دارید، حقوقِ فعلی، دوره‌ها و پرداختِ هر ماه با پاداش یا کسرش اینجا دیده می‌شود.',
      },
      {
        id: 'account', target: 'money-account', path: '/my-money', optional: true,
        title: 'حسابِ شما با شرکت',
        body: 'قرض، هدیه و هزینه‌هایی که برایتان ثبت شده و تسویه‌هایشان اینجاست. «بدهی» یعنی مبلغی که هنوز باید برگردانید.',
      },
    ],
  },

  // ─────────────── درخواستِ پرداخت (عضو) ───────────────
  {
    id: 'personal-money-request',
    title: 'درخواستِ پرداخت',
    description: 'از ماندهٔ طلبِ یک پروژه درخواستِ پرداخت بدهید.',
    audience: (c) => c.isMember,
    order: 44,
    next: ['personal-profile'],
    steps: [
      {
        id: 'nav', target: 'nav-my-money', kind: 'click', advanceOnPath: '/my-money', optional: true,
        title: 'منوی «امور مالی»',
        body: 'روی «امور مالی» بزنید.',
      },
      {
        id: 'go', target: 'money-row-link', kind: 'click', advanceOnPath: '/projects/', path: '/my-money', optional: true,
        title: 'رفتن به پروژه',
        body: 'روی «درخواست پرداخت» ِ پروژه‌ای بزنید که هنوز از آن طلب دارید.',
      },
      {
        id: 'form',
        title: 'فرمِ درخواست',
        body: 'در تبِ «مالی» ِ پروژه، بخشِ «درخواستِ پرداخت» را می‌بینید. مبلغ را تا سقفِ ماندهٔ خودتان بنویسید و دکمهٔ ثبتِ درخواست را بزنید.',
      },
      {
        id: 'units',
        title: 'پروژهٔ تعدادی',
        body: 'اگر کارتان تعدادی است، اول کارکرد را در بخشِ «کارکردها» ثبت کنید و بعد کنارِ هر ردیف «درخواست پرداخت» را بزنید.',
      },
      {
        id: 'status',
        title: 'پیگیریِ درخواست',
        body: 'درخواست به مدیرِ مالی می‌رسد. وضعیتش («در انتظار»، «تأییدشده»، «ردشده» یا «پرداخت‌شده») را در «امور مالی» زیرِ همان پروژه می‌بینید و رسیدِ پرداخت هم همان‌جا می‌آید.',
      },
    ],
  },

  // ─────────────── امورِ مالیِ من (کارفرما) ───────────────
  {
    id: 'personal-money-client',
    title: 'صورت‌حسابِ پروژه‌ها',
    description: 'ببینید هر پروژه چقدر است، چه پرداخته‌اید و چه مانده.',
    audience: isClient,
    order: 45,
    next: ['personal-profile'],
    steps: [
      {
        id: 'nav', target: 'nav-my-money', kind: 'click', advanceOnPath: '/my-money', optional: true,
        title: 'منوی «امور مالی»',
        body: 'روی «امور مالی» بزنید تا صورت‌حسابِ پروژه‌هایتان باز شود.',
      },
      {
        id: 'list', target: 'money-client-list', path: '/my-money', optional: true,
        title: 'صورت‌حسابِ پروژه‌های شما',
        body: 'برای هر پروژه یک ردیف هست با وضعیتِ «پرداخت‌نشده»، «پرداختِ جزئی» یا «تسویه‌شده».',
      },
      {
        id: 'chips', target: 'money-row-chips', path: '/my-money', optional: true,
        title: 'مبلغ‌ها',
        body: '«قیمت» مبلغِ پروژه است و «هزینه‌های قابلِ صورت‌حساب» هزینه‌هایی که برای پروژه انجام شده. «جمعِ بدهی» جمعِ این دو، «پرداختی» آنچه پرداخته‌اید و «مانده» باقیِ آن است.',
      },
      {
        id: 'open', target: 'money-row-toggle', kind: 'click', path: '/my-money', optional: true,
        title: 'باز کردنِ جزئیات',
        body: 'روی نامِ پروژه بزنید تا ریزِ پرداخت‌ها باز شود.',
      },
      {
        id: 'details', target: 'money-row-details', path: '/my-money', optional: true,
        title: 'پرداخت‌ها و هزینه‌ها',
        body: 'در «پرداخت‌های شما» هر پرداخت با تاریخ و مبلغ آمده و با «مشاهده» رسیدش باز می‌شود. «هزینه‌های انجام‌شده برای این پروژه» هم جدا فهرست شده است.',
      },
      {
        id: 'project', target: 'money-row-link', path: '/my-money', optional: true,
        title: 'رفتن به پروژه',
        body: 'با دکمهٔ «پروژه» به صفحهٔ همان پروژه می‌روید تا کارها، فایل‌ها و پیشرفتش را ببینید.',
      },
    ],
  },

  // ─────────────── پروفایل: حساب، بانک، ترجیحات، رمز ───────────────
  {
    id: 'personal-profile',
    title: 'پروفایلِ من',
    description: 'نام و ایمیل، تصویر، حسابِ بانکی، منطقهٔ زمانی و رمزِ ورود.',
    audience: () => true,
    order: 46,
    next: ['personal-profile-notify'],
    steps: [
      {
        id: 'menu', target: 'user-menu', optional: true,
        title: 'منوی حساب',
        body: '«پروفایلِ من» و «اعلان‌ها» در همین منوی حسابِ پایینِ سایدبار هستند.',
      },
      {
        id: 'tab-account', target: 'profile-tabs', kind: 'click', path: '/profile',
        title: 'تبِ «حساب کاربری»',
        body: 'روی تبِ «حساب کاربری» بزنید.',
      },
      {
        id: 'account', target: 'profile-account', path: '/profile', optional: true,
        title: 'حساب کاربری',
        body: 'نام، ایمیل و تلفنِ خودتان را اینجا اصلاح کنید و «ذخیره» را بزنید.',
      },
      {
        id: 'avatar', target: 'profile-avatar', path: '/profile', optional: true,
        title: 'تصویر پروفایل',
        body: 'یک عکس انتخاب کنید؛ پیش‌نمایشش همان‌جا دیده می‌شود. بعد «ذخیره تصویر» را بزنید. این تصویر کنارِ نامتان در همهٔ برنامه می‌آید.',
      },
      {
        id: 'tab-bank', target: 'profile-tabs', kind: 'click', path: '/profile',
        title: 'تبِ «حساب بانکی»',
        body: 'روی تبِ «حساب بانکی» بزنید.',
      },
      {
        id: 'bank', target: 'profile-bank', path: '/profile', optional: true,
        title: 'اطلاعات حساب بانکی',
        body: '«شماره حساب»، «شماره شبا» و «شماره کارت» را بنویسید و «ذخیره اطلاعات حساب» را بزنید. پرداخت‌ها به همین حساب واریز می‌شود.',
      },
      {
        id: 'tab-prefs', target: 'profile-tabs', kind: 'click', path: '/profile',
        title: 'تبِ «ترجیحات»',
        body: 'روی تبِ «ترجیحات» بزنید.',
      },
      {
        id: 'prefs', target: 'profile-prefs', path: '/profile', optional: true,
        title: 'منطقهٔ زمانی',
        body: 'نامِ شهر یا منطقه را تایپ کنید و از فهرست انتخاب کنید تا ساعت‌ها به وقتِ شما نشان داده شوند؛ خالی یعنی پیش‌فرضِ سامانه. بعد «ذخیره» را بزنید.',
      },
      {
        id: 'tab-password', target: 'profile-tabs', kind: 'click', path: '/profile',
        title: 'تبِ «رمزِ ورود»',
        body: 'روی تبِ «رمزِ ورود» بزنید.',
      },
      {
        id: 'password', target: 'profile-password', path: '/profile', optional: true,
        title: 'تغییرِ رمز',
        body: '«رمزِ فعلی» و دو بار «رمزِ تازه» (دستِ‌کم ۸ نویسه) را بنویسید و «تغییرِ رمز» را بزنید. اگر هنوز رمزی نگذاشته‌اید، رمزِ فعلی را خالی بگذارید.',
      },
      {
        id: 'access', path: '/profile',
        title: 'دسترسی‌های من',
        body: 'اگر به سامانه‌ای بیرونی دسترسی گرفته‌اید، تبِ «دسترسی‌های من» هم اینجا پیدا می‌شود و حساب‌ها و راهنمای هر کدام را نشان می‌دهد.',
      },
    ],
  },

  // ─────────────── پروفایل: اعلان‌ها و تلگرام ───────────────
  {
    id: 'personal-profile-notify',
    title: 'اعلان‌ها و تلگرام',
    description: 'اعلان روی گوشی، ایمیل و تلگرام را تنظیم کنید.',
    audience: () => true,
    order: 47,
    next: ['personal-notifications', 'personal-profile-ai'],
    steps: [
      {
        id: 'tab', target: 'profile-tabs', kind: 'click', path: '/profile',
        title: 'تبِ «اعلان‌ها و تلگرام»',
        body: 'روی تبِ «اعلان‌ها و تلگرام» بزنید.',
      },
      {
        id: 'intro', target: 'profile-notify', path: '/profile', optional: true,
        title: 'کانال‌های اعلان',
        body: 'زنگِ داخلِ برنامه همیشه روشن است. اینجا تعیین می‌کنید اعلان‌ها روی دستگاه، ایمیل یا تلگرام هم برسند.',
      },
      {
        id: 'push', target: 'profile-push', path: '/profile', optional: true,
        title: 'اعلان روی این دستگاه',
        body: 'با «روشن کردنِ اعلان روی این دستگاه» اعلان‌ها حتی وقتی برنامه بسته است روی همین گوشی یا کامپیوتر می‌آیند. هر دستگاه را جدا روشن کنید.',
      },
      {
        id: 'email', target: 'profile-notify-email', path: '/profile', optional: true,
        title: 'اعلان با ایمیل',
        body: 'با کلیدِ «دریافتِ اعلان با ایمیل» ایمیل را روشن یا خاموش کنید. در «ایمیلِ اختصاصیِ اعلان» می‌توانید نشانیِ دیگری بدهید.',
      },
      {
        id: 'muted', target: 'profile-notify-muted', path: '/profile', optional: true,
        title: 'دسته‌های بی‌ایمیل',
        body: 'دسته‌هایی را که نمی‌خواهید ایمیلشان بیاید تیک بزنید؛ همچنان در زنگِ برنامه دیده می‌شوند.',
      },
      {
        id: 'telegram', target: 'profile-telegram', path: '/profile', optional: true,
        title: 'اتصال به تلگرام',
        body: '«اتصال به تلگرام» ربات را باز می‌کند؛ آنجا Start را بزنید، برگردید و «Start را زدم — اتصال را کامل کن» را بزنید. پس از اتصال با «ارسال پیام تست» آن را بیازمایید.',
      },
      {
        id: 'tg-prefs', target: 'profile-telegram-prefs', path: '/profile', optional: true,
        title: 'آنچه در تلگرام بیاید',
        body: 'دسته‌هایی را که در تلگرام نمی‌خواهید خاموش کنید و اگر خواستید «ساعتِ سکوت» بگذارید؛ پایانِ سکوت یک خلاصه می‌آید.',
      },
      {
        id: 'tg-reminders', target: 'profile-telegram-reminders', path: '/profile', optional: true,
        title: 'یادآورهای تلگرام',
        body: '«گزارشِ صبحگاهی»، «گزارشِ عصر» و یادآورهایی مثلِ ثبتِ ساعت یا جلسهٔ نزدیک را اینجا روشن یا خاموش کنید و ساعتشان را بگذارید.',
      },
      {
        id: 'save', target: 'profile-notify-save', path: '/profile', optional: true,
        title: 'ذخیره',
        body: 'پس از تغییرِ این تنظیمات، «ذخیره» را بزنید تا اعمال شوند.',
      },
    ],
  },

  // ─────────────── پروفایل: دستیارِ هوشِ مصنوعی ───────────────
  {
    id: 'personal-profile-ai',
    title: 'دستیارِ هوشِ مصنوعی',
    description: 'هوشِ مصنوعیِ خودتان را به برنامه وصل کنید.',
    audience: (c) => !c.isClientOnly,
    order: 48,
    steps: [
      {
        id: 'tab', target: 'profile-tabs', kind: 'click', path: '/profile',
        title: 'تبِ «دستیارِ هوشِ مصنوعی»',
        body: 'روی تبِ «دستیارِ هوشِ مصنوعی» بزنید.',
      },
      {
        id: 'intro', target: 'profile-mcp', path: '/profile', optional: true,
        title: 'هوشِ مصنوعیِ خودتان',
        body: 'ابزارهایی مثلِ Claude یا ChatGPT را وصل کنید و بپرسید «امروز چه تسکی دارم؟» یا بگویید ساعت ثبت کند. همیشه فقط با همان دسترسی‌هایی که خودتان دارید.',
      },
      {
        id: 'bot', target: 'profile-mcp', path: '/profile', optional: true,
        title: 'ربات تلگرامِ هوشمند',
        body: 'در «ربات تلگرامِ هوشمند» می‌توانید هوشِ مصنوعیِ خودتان را وصل کنید تا ربات متنِ آزاد را هم بفهمد. هر کارِ نوشتنی پیش از انجام از شما تأیید می‌گیرد.',
      },
      {
        id: 'tokens', target: 'profile-mcp', path: '/profile', optional: true,
        title: 'اتصال‌ها و توکن‌ها',
        body: '«اتصال از وب و موبایل» نشانیِ اتصال را می‌دهد و «اتصال با توکن» برای ابزارهای دسکتاپ است. در «توکن‌های من» هر توکنی را که دیگر لازم ندارید باطل کنید.',
      },
    ],
  },

  // ─────────────── صفحهٔ اعلان‌ها ───────────────
  {
    id: 'personal-notifications',
    title: 'اعلان‌ها',
    description: 'همهٔ اعلان‌ها را ببینید، باز کنید و خوانده کنید.',
    audience: () => true,
    order: 49,
    steps: [
      {
        id: 'bell', target: 'topbar-notifications', optional: true,
        title: 'زنگِ اعلان‌ها',
        body: 'زنگِ نوارِ بالا اعلان‌های تازه را نشان می‌دهد. فهرستِ کامل و قدیمی‌ترها در صفحهٔ «اعلان‌ها» است که از منوی حساب باز می‌شود.',
      },
      {
        id: 'tabs', target: 'notifications-tabs', path: '/notifications',
        title: 'خوانده‌نشده‌ها و همه',
        body: 'پیش‌فرض فقط «خوانده‌نشده‌ها» دیده می‌شود.',
      },
      {
        id: 'all', target: 'notifications-tab-all', kind: 'click', path: '/notifications',
        title: 'همهٔ اعلان‌ها',
        body: 'روی «همه» بزنید تا اعلان‌های خوانده‌شده هم بیایند.',
      },
      {
        id: 'list', target: 'notifications-list', path: '/notifications', optional: true,
        title: 'هر اعلان',
        body: 'آیکون نوعِ اعلان را نشان می‌دهد و نقطهٔ رنگی یعنی هنوز نخوانده‌اید. زیرِ عنوان دسته و زمانش آمده است.',
      },
      {
        id: 'actions', target: 'notifications-actions', path: '/notifications', optional: true,
        title: 'مشاهده یا خوانده شد',
        body: '«مشاهده» اعلان را خوانده می‌کند و شما را به همان کار یا پروژه می‌برد. «خوانده شد» فقط علامتش می‌زند.',
      },
      {
        id: 'read-all', target: 'notifications-read-all', path: '/notifications', optional: true,
        title: 'خواندنِ همه',
        body: 'با «خواندنِ همه» همهٔ اعلان‌های خوانده‌نشده یک‌جا خوانده می‌شوند.',
      },
      {
        id: 'settings',
        title: 'تنظیمِ اعلان‌ها',
        body: 'اینکه اعلان‌ها با ایمیل، تلگرام یا روی گوشی هم برسند را در «پروفایلِ من»، تبِ «اعلان‌ها و تلگرام» تعیین کنید.',
      },
    ],
  },
];
