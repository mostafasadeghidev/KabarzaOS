import { can, type Tour, type TourCtx, type TourStep } from '../types';

/**
 * راهنماهای بخشِ «finance» — صفحهٔ «مالی» (/finance) و «گزارش‌ها» (/reports).
 *
 * مخاطبان:
 *  · حسابدار (نقشِ finance — هم دیدن و هم مدیریتِ مالی)؛
 *  · مدیرِ مالی (همکارِ ادمین با finance.manage)؛
 *  · بینندهٔ مالی (همکارِ ادمین فقط با finance.view — دکمه‌های ثبت را نمی‌بیند)؛
 *  · مالک (همه‌چیز، به‌علاوهٔ تأیید/ردِ درخواستِ پرداخت).
 *
 * ⚠️ تب‌های صفحهٔ مالی و گزارش‌ها `OverflowTabs` اند و برای هر تب برچسبِ جدا ندارند؛ قدمِ کلیک
 * روی کلِ نوارِ تب است (`finance-tabs` / `reports-tabs`) و متن می‌گوید کدام تب را بزنید.
 * ⚠️ هیچ قدمِ کلیکی روی دکمه‌ای نیست که ذخیره/پرداخت/حذف کند؛ فقط باز کردنِ فرم و «انصراف».
 * ⚠️ متن‌ها رشتهٔ ثابتِ تک‌خطی‌اند (نه template) تا استخراج‌گرِ کلیدهای ترجمه پیدایشان کند.
 */

/** دیدنِ مالی (حسابدار، مدیرِ مالی، بیننده، مالک). */
const seesFinance = (c: TourCtx) => can(c, 'finance.view');
/** ثبت و ویرایش در مالی. */
const managesFinance = (c: TourCtx) => can(c, 'finance.manage');
/** دیدنِ گزارش‌ها — حسابدارِ خالص این مجوز را ندارد. */
const seesReports = (c: TourCtx) => can(c, 'reports.view');

/** قدمِ اولِ هر راهنمای مالی: رفتن به صفحهٔ «مالی». */
const goFinance: TourStep = {
  id: 'go-finance', target: 'nav-finance', kind: 'click', advanceOnPath: '/finance',
  title: 'منوی «مالی»', body: 'روی «مالی» در منو بزنید تا صفحهٔ حسابداری باز شود.',
};
/** قدمِ اولِ هر راهنمای گزارش: رفتن به صفحهٔ «گزارش‌ها». */
const goReports: TourStep = {
  id: 'go-reports', target: 'nav-reports', kind: 'click', advanceOnPath: '/reports',
  title: 'منوی «گزارش‌ها»', body: 'روی «گزارش‌ها» در منو بزنید.',
};
/** کلیک روی تبِ «دفترکل». */
const ledgerTab: TourStep = {
  id: 'tab-ledger', target: 'finance-tabs', kind: 'click', path: '/finance',
  title: 'تبِ «دفترکل»', body: 'روی تبِ «دفترکل» بزنید.',
};
const reportMembersTab: TourStep = {
  id: 'tab-members', target: 'reports-tabs', kind: 'click', path: '/reports',
  title: 'تبِ «اعضا»', body: 'روی تبِ «اعضا» بزنید.',
};
const reportClientsTab: TourStep = {
  id: 'tab-clients', target: 'reports-tabs', kind: 'click', path: '/reports',
  title: 'تبِ «مطالبات کارفرما»', body: 'روی تبِ «مطالبات کارفرما» بزنید.',
};

export const tours: Tour[] = [
  // ───────────────────────── ۱. آشنایی با صفحهٔ مالی و دفترکل ─────────────────────────
  {
    id: 'finance-overview',
    title: 'آشنایی با بخشِ مالی',
    description: 'تب‌های صفحهٔ مالی، حسابِ فعلی، کارت‌های مانده، فیلترها و جدولِ دفترکل.',
    audience: seesFinance,
    order: 500,
    next: ['finance-entry-create', 'finance-member-payments'],
    steps: [
      { id: 'hello', title: 'بخشِ مالی', body: 'همهٔ پولِ آژانس اینجا ثبت می‌شود: واریز و برداشت، پرداخت به اعضا، حقوق، قرض و هزینه‌های ثابت. بیایید با هم بگردیم.' },
      goFinance,
      {
        id: 'pick-account', target: 'finance-account-picker', kind: 'click', path: '/finance', optional: true,
        title: 'انتخابِ حساب', body: 'چند حساب دارید؛ روی حسابی که می‌خواهید دفترش را ببینید بزنید. دفعهٔ بعد همین حساب خودش باز می‌شود.',
      },
      {
        id: 'tabs', target: 'finance-tabs', path: '/finance',
        title: 'تب‌های مالی',
        body: '«دفترکل» ردیف‌های هر حساب است؛ «مالی اعضا» درخواست‌ها و پرداخت به اعضا؛ «حسابِ اعضا» قرض و هدیه؛ «حقوق‌ها» و «هزینه‌ها» پرداخت‌های ماهانه. «دوره‌های بسته» فقط وقتی دوره‌ای بسته شده باشد می‌آید.',
      },
      {
        id: 'account', target: 'finance-ledger-account', path: '/finance',
        title: 'حسابِ فعلی',
        body: 'نام و ارزِ حسابی که الان می‌بینید. اگر چند حساب دارید، از فهرستِ کنارش حساب را عوض کنید؛ هر ردیفِ تازه در همین حساب ثبت می‌شود.',
      },
      {
        id: 'cards', target: 'finance-ledger-cards', path: '/finance',
        title: 'کارت‌های مانده',
        body: '«مانده اولیه» نقطهٔ شروعِ حساب است، بعد «مجموع واریز» و «مجموع برداشت»، و «مانده» پولی است که الان در حساب هست. برای پنهان کردنِ مبالغ از منوی کاربر کمک بگیرید.',
      },
      {
        id: 'filter', target: 'finance-ledger-filter', path: '/finance',
        title: 'فیلترِ دفترکل',
        body: 'ردیف‌ها را با بازهٔ تاریخ، دسته، پروژه یا نامِ طرف‌حساب محدود کنید و «جستجو» را بزنید. «پاک‌کردن» همه را برمی‌گرداند.',
      },
      {
        id: 'export', target: 'finance-ledger-export', path: '/finance',
        title: 'خروجی CSV',
        body: 'همین ردیف‌ها با همین فیلتر به‌صورتِ فایلِ CSV دانلود می‌شوند؛ برای اکسل یا حسابرس.',
      },
      {
        id: 'table', target: 'finance-ledger-table', path: '/finance', optional: true,
        title: 'جدولِ دفترکل',
        body: 'هر ردیف یک واریز (سبز، با +) یا برداشت (قرمز، با −) است: تاریخ، دسته‌ها، پرداخت‌کننده، دریافت‌کننده، پروژه و رسید. ردیفِ دورهٔ بسته قفل دارد و تغییر نمی‌کند.',
      },
      {
        id: 'row-actions', target: 'finance-ledger-table', path: '/finance', optional: true, when: managesFinance,
        title: 'ویرایش و حذفِ ردیف',
        body: 'آخرِ هر ردیف مداد برای ویرایش و سطل برای حذف است. حذفِ ردیفی که بخشی از یک واریزِ گروهی است، اول می‌پرسد کلِ گروه حذف شود یا فقط همان سهم.',
      },
      {
        id: 'open-row', target: 'finance-entry-open', kind: 'click', path: '/finance', optional: true,
        title: 'جزئیاتِ یک ردیف',
        body: 'روی شمارهٔ یک ردیف بزنید تا همهٔ جزئیاتش باز شود.',
      },
      {
        id: 'detail', target: 'finance-entry-detail', optional: true,
        title: 'پنجرهٔ جزئیات',
        body: 'همهٔ اطلاعاتِ ردیف، معادلِ یورو و رسیدهای پیوست‌شده اینجاست. روی تصویرِ رسید بزنید تا بزرگ شود.',
      },
      { id: 'bye', title: 'پایانِ آشنایی', body: 'حالا می‌دانید دفترکل کجاست. راهنماهای بعدی ثبتِ ردیف و پرداخت به اعضا را نشان می‌دهند.' },
    ],
  },

  // ───────────────────────── ۲. ثبتِ ردیفِ تازه (واریز/برداشت) ─────────────────────────
  {
    id: 'finance-entry-create',
    title: 'ثبتِ ردیفِ تازه در دفترکل',
    description: 'ثبتِ واریز یا برداشت با دسته، پروژه، طرف‌حساب، ارز و رسید.',
    audience: managesFinance,
    order: 501,
    next: ['finance-pay-member', 'finance-transfer'],
    steps: [
      goFinance,
      ledgerTab,
      {
        id: 'add', target: 'finance-entry-add', kind: 'click', path: '/finance',
        title: 'ثبت ردیف جدید', body: 'روی «ثبت ردیف جدید» بزنید تا فرمِ ردیف باز شود.',
      },
      {
        id: 'dialog', target: 'finance-entry-dialog',
        title: 'فرمِ ردیف', body: 'بالای فرم نامِ حسابی آمده که ردیف در آن ثبت می‌شود. اگر حساب اشتباه است، فرم را ببندید و حساب را عوض کنید.',
      },
      {
        id: 'basics', target: 'finance-entry-basics',
        title: 'تاریخ، جهت و دسته',
        body: 'تاریخ را روزِ واقعیِ واریز بگذارید. «جهت» را «واریز / درآمد» یا «برداشت / هزینه» انتخاب کنید و یک یا چند دسته بزنید. تاریخ‌های دورهٔ بسته انتخاب‌شدنی نیستند.',
      },
      {
        id: 'project', target: 'finance-entry-project',
        title: 'بابت (پروژه)',
        body: 'اگر پول مربوط به پروژه‌ای است، آن را انتخاب کنید؛ با «تقسیم بین چند پروژه» یک واریز را بینِ چند پروژه پخش کنید. برای هزینهٔ پروژه، تیکِ «قابل بازپرداخت از کارفرما» آن را به مطالباتِ کارفرما اضافه می‌کند.',
      },
      {
        id: 'party', target: 'finance-entry-party',
        title: 'پرداخت‌کننده یا دریافت‌کننده',
        body: 'برای واریز «پرداخت‌کننده» (مثلاً کارفرما) و برای برداشت «دریافت‌کننده» را بدهید. عضو یا کارفرمای سامانه را جستجو کنید یا یک نامِ آزاد بنویسید.',
      },
      {
        id: 'amount', target: 'finance-entry-amount',
        title: 'مبلغ و ارز',
        body: 'همان عددِ رسیدِ بانکی را بنویسید و ارزش را انتخاب کنید. اگر ارز با ارزِ حساب فرق دارد، خانهٔ مبلغِ واقعی در حساب (با کارمزد) هم پیدا می‌شود؛ معادلِ یورو خودکار حساب می‌شود.',
      },
      {
        id: 'receipt', target: 'finance-receipt',
        title: 'پیوستِ رسید',
        body: 'تصویر یا PDF ِ رسید را انتخاب کنید؛ چند فایل هم می‌شود. عکسِ صفحه را هم می‌توانید با Ctrl+V همین‌جا بچسبانید. روی تصویرِ انتخاب‌شده بزنید تا بزرگ شود و با × برش دارید.',
      },
      {
        id: 'recurring', title: 'هزینهٔ دوره‌ای',
        body: 'در برداشت، زیرِ رسید تیکی هست که همین هزینه را «دوره‌ای» هم ثبت می‌کند (مثلاً هر ماه)؛ بعداً در تبِ «هزینه‌ها» سررسیدش یادآوری می‌شود.',
      },
      {
        id: 'submit', target: 'finance-entry-submit',
        title: 'ذخیرهٔ ردیف',
        body: 'با دکمهٔ «ثبت در …» ردیف ذخیره می‌شود؛ نامِ حساب روی خودِ دکمه است تا پیش از ثبت دوباره ببینید. «انصراف» فرم را بی‌ذخیره می‌بندد.',
      },
    ],
  },

  // ───────────────────────── ۳. پرداخت به عضو با رسید ─────────────────────────
  {
    id: 'finance-pay-member',
    title: 'ثبتِ پرداخت به عضو با عکسِ رسید',
    description: 'پرداختِ دستمزدِ پروژه به یک عضو، کم شدن از طلبش و پیوستِ رسید.',
    audience: managesFinance,
    order: 502,
    next: ['finance-member-payments'],
    steps: [
      goFinance,
      ledgerTab,
      {
        id: 'add', target: 'finance-entry-add', kind: 'click', path: '/finance',
        title: 'ثبت ردیف جدید', body: 'روی «ثبت ردیف جدید» بزنید.',
      },
      {
        id: 'direction', target: 'finance-entry-basics',
        title: 'جهت: برداشت',
        body: 'پرداخت به عضو پولی است که از حساب می‌رود؛ «جهت» را «برداشت / هزینه» بگذارید و تاریخ را روزِ واقعیِ واریز.',
      },
      {
        id: 'project', target: 'finance-entry-project',
        title: 'پروژهٔ پرداخت',
        body: 'پروژه‌ای را که دستمزدش را می‌پردازید انتخاب کنید تا پرداخت به حسابِ همان پروژه نوشته شود.',
      },
      {
        id: 'receiver', target: 'finance-entry-party',
        title: 'دریافت‌کننده',
        body: 'نامِ عضو را جستجو و انتخاب کنید. اگر عضوِ همان پروژه باشد، زیرِ مبلغ خطِ «از طلبِ … کم شود» پیدا می‌شود.',
      },
      {
        id: 'amount', target: 'finance-entry-amount',
        title: 'مبلغ و کم شدن از طلب',
        body: 'مبلغی را که از حساب رفت بنویسید. اگر ارزِ قراردادِ عضو فرق دارد، با نرخِ روز تبدیل می‌شود؛ با «عددِ دیگری کم شود» یا «هزینهٔ انتقال دارد» عددِ دقیق را خودتان بدهید. برای کارِ تعدادی، کارکردِ پرداخت‌نشده را از فهرست انتخاب کنید.',
      },
      {
        id: 'receipt', target: 'finance-receipt',
        title: 'عکسِ رسید',
        body: 'عکسِ رسیدِ بانکی را انتخاب کنید یا عکسِ صفحه را با Ctrl+V بچسبانید. عضو هم رسید را در «امور مالی» ِ خودش می‌بیند.',
      },
      {
        id: 'submit', target: 'finance-entry-submit',
        title: 'ثبتِ پرداخت',
        body: 'با دکمهٔ «ثبت در …» پرداخت ذخیره می‌شود و از طلبِ عضو کم می‌شود. در این راهنما چیزی ذخیره نشد؛ اگر نمی‌خواهید، «انصراف» را بزنید.',
      },
    ],
  },

  // ───────────────────────── ۴. انتقال بینِ حساب‌ها ─────────────────────────
  {
    id: 'finance-transfer',
    title: 'انتقال بینِ حساب‌ها',
    description: 'جابه‌جاییِ پول بینِ دو حساب با کارمزد و رسید.',
    audience: managesFinance,
    order: 503,
    next: ['finance-accounts'],
    steps: [
      goFinance,
      ledgerTab,
      {
        id: 'open', target: 'finance-transfer-open', kind: 'click', path: '/finance',
        title: 'دکمهٔ «انتقال»', body: 'روی «انتقال» بزنید تا فرمِ انتقال باز شود.',
      },
      {
        id: 'fields', target: 'finance-transfer-fields',
        title: 'از کجا به کجا',
        body: '«از حساب» و «به حساب» را انتخاب کنید. «مبلغِ خروجی» آن است که از حسابِ اول رفت و «مبلغِ رسیده» آن که واقعاً رسید؛ فرقشان کارمزد حساب می‌شود.',
      },
      {
        id: 'receipt', target: 'finance-transfer-receipt',
        title: 'رسیدِ انتقال',
        body: 'یک تصویر یا PDF پیوست کنید؛ روی هر دو طرفِ انتقال می‌نشیند.',
      },
      {
        id: 'submit', target: 'finance-transfer-submit',
        title: 'ثبتِ انتقال',
        body: 'با «ثبتِ انتقال» دو ردیف (برداشت و واریز) با هم ثبت می‌شوند. «انصراف» فرم را بی‌ذخیره می‌بندد.',
      },
    ],
  },

  // ───────────────────────── ۵. مالی اعضا: درخواست‌ها و پرداخت ─────────────────────────
  {
    id: 'finance-member-payments',
    title: 'درخواست‌های پرداختِ اعضا',
    description: 'تأیید، پرداخت و ردِ درخواست‌ها، کارکردهای پرداخت‌نشده و شمارهٔ حسابِ اعضا.',
    audience: seesFinance,
    order: 504,
    next: ['finance-member-accounts', 'finance-salaries'],
    steps: [
      goFinance,
      {
        id: 'tab-members', target: 'finance-tabs', kind: 'click', path: '/finance',
        title: 'تبِ «مالی اعضا»', body: 'روی تبِ «مالی اعضا» بزنید؛ روی گوشی شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'status', target: 'finance-requests-status',
        title: 'وضعیتِ درخواست‌ها',
        body: 'درخواست‌هایی که اعضا از «امور مالی» ِ خودشان فرستاده‌اند، بر اساسِ وضعیت جدا شده‌اند: «در انتظار»، «تأییدشده»، «پرداخت‌شده» و بقیه. عددِ کنارِ «در انتظار» یعنی چند درخواست منتظرِ رسیدگی است.',
      },
      {
        id: 'table', target: 'finance-requests-table',
        title: 'فهرستِ درخواست‌ها',
        body: 'برای هر درخواست: عضو و یادداشتش، پروژه، مبلغ، ماندهٔ قراردادِ او، تاریخ، وضعیت و اطلاعاتِ بانکی‌اش برای واریز.',
      },
      {
        id: 'owner-decide', target: 'finance-requests-table', when: (c) => c.isOwner,
        title: 'تأیید یا رد',
        body: 'شما کنارِ هر درخواستِ «در انتظار» دکمهٔ «تأیید» و «رد» دارید؛ «رد» یک دلیلِ اختیاری هم می‌گیرد. حسابدار فقط درخواستِ تأییدشده را می‌پردازد.',
      },
      {
        id: 'pay', target: 'finance-requests-table', when: managesFinance,
        title: 'پرداختِ درخواست',
        body: 'برای درخواستِ تأییدشده دکمهٔ «پرداخت» را بزنید؛ حساب، تاریخ و مبلغِ واقعی را می‌پرسد و با «ثبت پرداخت» ردیفِ برداشت در دفتر نوشته و درخواست «پرداخت‌شده» می‌شود.',
      },
      {
        id: 'units', target: 'finance-unpaid-units',
        title: 'کارکردهای پرداخت‌نشده',
        body: 'کارکردِ پروژه‌های تعدادی که هنوز پرداخت نشده و درخواستی هم ندارد. با «ثبت در حسابداری» مستقیم می‌پردازید؛ عددِ کمتر بنویسید تا قسطی پرداخت شود.',
      },
      {
        id: 'bank', target: 'finance-bank-directory',
        title: 'اطلاعات حساب اعضا',
        body: 'شمارهٔ حساب، شبا و کارتِ اعضا برای واریز. با جستجو عضو را پیدا کنید؛ این اطلاعات را هر عضو خودش در پروفایلش می‌نویسد.',
      },
    ],
  },

  // ───────────────────────── ۶. حسابِ اعضا: قرض، هدیه، هزینه ─────────────────────────
  {
    id: 'finance-member-accounts',
    title: 'حسابِ اعضا: قرض، هدیه و هزینه',
    description: 'ثبتِ قرض، هدیه، هزینه برای عضو، بازپرداخت، کسر از دستمزد و بخشیدن.',
    audience: seesFinance,
    order: 505,
    next: ['finance-salaries'],
    steps: [
      goFinance,
      {
        id: 'tab-balances', target: 'finance-tabs', kind: 'click', path: '/finance',
        title: 'تبِ «حسابِ اعضا»', body: 'روی تبِ «حسابِ اعضا» بزنید؛ روی گوشی شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'totals', target: 'finance-balances-totals',
        title: 'جمعِ بدهی‌ها',
        body: '«جمعِ بدهی‌ها» یعنی اعضا روی‌هم چقدر به شرکت بدهکارند، به تفکیکِ ارز؛ «هدیه و بخشیده» پولی است که برنمی‌گردد. با «همهٔ اعضا» اعضای فعالی هم که هنوز ردیفی ندارند دیده می‌شوند.',
      },
      {
        id: 'table', target: 'finance-balances-table', optional: true,
        title: 'فهرستِ اعضا',
        body: 'ماندهٔ بدهی، هدیه و آخرین ردیفِ هر نفر. نشانِ «موعدِ برگشت گذشته» یعنی زمانِ بازپرداختِ قرضش رسیده است.',
      },
      {
        id: 'add', target: 'finance-balances-add', kind: 'click', when: managesFinance,
        title: 'دکمهٔ «ثبتِ جدید»', body: 'روی «ثبتِ جدید» بزنید تا فرم باز شود.',
      },
      {
        id: 'kind', target: 'finance-balances-kind', when: managesFinance,
        title: 'نوعِ ردیف',
        body: '«قرض» عضو را بدهکار می‌کند و «هدیه» نه. «هزینه برای عضو» مثلِ اشتراکی است که برایش خریده‌اید. «بازپرداخت» پولِ برگشتی است، «کسر از دستمزد» از دستمزدِ پروژه کم می‌کند و «بخشیده‌شده» بدهی را پاک می‌کند.',
      },
      {
        id: 'form', target: 'finance-balances-form', when: managesFinance,
        title: 'عضو، حساب و مبلغ',
        body: 'عضو، حسابی که پول از آن می‌رود (یا به آن برمی‌گردد)، مبلغ، ارز و تاریخ را بدهید. برای قرض «موعدِ برگشت» هم می‌شود گذاشت. زیرِ فرم توضیحِ همان نوع آمده است.',
      },
      {
        id: 'submit', target: 'finance-balances-submit', when: managesFinance,
        title: 'ذخیرهٔ ردیف', body: 'با «ثبت» ردیف ذخیره می‌شود و اگر پولی جابه‌جا شده، ردیفش در دفترکل هم نوشته می‌شود.',
      },
      {
        id: 'cancel', target: 'finance-balances-cancel', kind: 'click', when: managesFinance,
        title: 'بستنِ فرم', body: 'حالا «انصراف» را بزنید تا فرم بی‌ذخیره بسته شود.',
      },
      {
        id: 'view', target: 'finance-balances-view', kind: 'click', optional: true,
        title: 'ریزِ حسابِ یک عضو', body: 'روی «ریز» ِ یک عضو بزنید تا همهٔ ردیف‌هایش را ببینید.',
      },
      {
        id: 'kinds', target: 'finance-balances-kinds', optional: true, when: managesFinance,
        title: 'کارهای سریع',
        body: 'از همین‌جا برای همان عضو قرض، هدیه، بازپرداخت، کسر از دستمزد یا بخشیدن را مستقیم ثبت کنید.',
      },
    ],
  },

  // ───────────────────────── ۷. حقوق‌ها ─────────────────────────
  {
    id: 'finance-salaries',
    title: 'حقوقِ ماهانه',
    description: 'تعریفِ حقوق برای عضو، پرداختِ هر ماه با پاداش و قسطِ قرض، تغییر و توقف.',
    audience: seesFinance,
    order: 506,
    next: ['finance-expenses'],
    steps: [
      goFinance,
      {
        id: 'tab-salaries', target: 'finance-tabs', kind: 'click', path: '/finance',
        title: 'تبِ «حقوق‌ها»', body: 'روی تبِ «حقوق‌ها» بزنید؛ روی گوشی شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'queue', target: 'finance-salaries-queue', optional: true,
        title: 'پرداخت‌نشده تا این ماه',
        body: 'ماه‌هایی که حقوقشان سررسید شده و هنوز پرداخت نشده؛ «عقب‌افتاده» یعنی از ماهش گذشته است. دکمهٔ «پرداخت» فرمی با حساب، تاریخ، پاداش، کسر و قسطِ قرض باز می‌کند و «خالصِ پرداخت» را نشان می‌دهد.',
      },
      {
        id: 'table', target: 'finance-salaries-table', optional: true,
        title: 'فهرستِ حقوق‌ها',
        body: 'حقوقِ فعلیِ هر عضو، ماه‌های پرداخت‌نشده و آخرین پرداخت. «متوقف» یعنی حقوقش فعلاً قطع است.',
      },
      {
        id: 'add', target: 'finance-salaries-add', kind: 'click', when: managesFinance,
        title: 'دکمهٔ «حقوقِ تازه»', body: 'روی «حقوقِ تازه» بزنید.',
      },
      {
        id: 'form', target: 'finance-salaries-form', when: managesFinance,
        title: 'دورهٔ حقوق',
        body: 'عضو، «مبلغِ ماهانه»، ارز، «روزِ پرداخت» و «از ماهِ» را بدهید. «تا ماهِ» را خالی بگذارید تا ادامه داشته باشد؛ «حسابِ پیش‌فرضِ پرداخت» هنگامِ پرداخت پیشنهاد می‌شود.',
      },
      {
        id: 'submit', target: 'finance-salaries-submit', when: managesFinance,
        title: 'ذخیرهٔ حقوق', body: 'با «ذخیره» از ماهِ انتخابی هر ماه حقوق سررسید می‌شود.',
      },
      {
        id: 'cancel', target: 'finance-salaries-cancel', kind: 'click', when: managesFinance,
        title: 'بستنِ فرم', body: 'حالا «انصراف» را بزنید تا فرم بی‌ذخیره بسته شود.',
      },
      {
        id: 'view', target: 'finance-salaries-view', kind: 'click', optional: true,
        title: 'ریزِ حقوقِ یک عضو', body: 'روی «ریز» ِ یک عضو بزنید.',
      },
      {
        id: 'periods', target: 'finance-salaries-periods', optional: true,
        title: 'دوره‌ها و پرداخت‌ها',
        body: 'هر دوره با مبلغ و حسابش. «تغییرِ مبلغ» از ماهی که می‌گویید مبلغِ تازه می‌گذارد، «توقفِ حقوق» قطعش می‌کند و «ادامهٔ حقوق» دوباره راهش می‌اندازد. پایینش پرداخت‌های هر ماه است.',
      },
    ],
  },

  // ───────────────────────── ۸. هزینه‌ها و تمدیدهای دوره‌ای ─────────────────────────
  {
    id: 'finance-expenses',
    title: 'هزینه‌ها و تمدیدهای دوره‌ای',
    description: 'اجاره، اشتراک و هزینه‌های تکراری با سررسید، و پرداختِ هر نوبت.',
    audience: seesFinance,
    order: 507,
    next: ['finance-accounts'],
    steps: [
      goFinance,
      {
        id: 'tab-expenses', target: 'finance-tabs', kind: 'click', path: '/finance',
        title: 'تبِ «هزینه‌ها»', body: 'روی تبِ «هزینه‌ها» بزنید؛ روی گوشی شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'filters', target: 'finance-expense-filters', optional: true,
        title: 'جستجو و فیلتر',
        body: 'هزینه‌ها را با عنوان، طرف‌حساب، نوع، وضعیت، دسته، حساب یا بازهٔ سررسید پیدا کنید. در فهرستِ طرف‌حساب‌ها جمعِ هزینه‌های هر کدام کنارِ نامش آمده است.',
      },
      {
        id: 'table', target: 'finance-expense-table', optional: true,
        title: 'سررسیدها',
        body: 'هزینه‌ها بر اساسِ سررسید گروه شده‌اند: معوق، این هفته، این ماه و بعد. «ثبت پرداخت» نوبتِ فعلی را در دفتر می‌نویسد و سررسید را یک دوره جلو می‌برد.',
      },
      {
        id: 'add', target: 'finance-expense-add', kind: 'click', when: managesFinance,
        title: 'دکمهٔ «افزودن هزینه»', body: 'روی «افزودن هزینه» بزنید.',
      },
      {
        id: 'dialog', target: 'finance-expense-dialog', when: managesFinance,
        title: 'عنوان و مبلغ',
        body: 'عنوان (مثلاً «اجارهٔ دفتر») و مبلغ را بنویسید. هزینهٔ «یک‌بار» پس از پرداخت بسته می‌شود؛ «دوره‌ای» سررسیدش جلو می‌رود.',
      },
      {
        id: 'schedule', target: 'finance-expense-schedule', when: managesFinance,
        title: 'ارز و تکرار', body: 'ارز و نوع را انتخاب کنید و برای هزینهٔ دوره‌ای بگویید هر چند روز، هفته، ماه یا سال تکرار شود.',
      },
      {
        id: 'account', target: 'finance-expense-account', when: managesFinance,
        title: 'سررسید، حساب و طرف‌حساب',
        body: '«سررسیدِ بعدی» روزی است که یادآوری می‌شود. «حسابِ پرداخت» را بدهید تا پرداخت در دفتر ثبت شود؛ طرف‌حسابِ تازه را همین‌جا با نوشتنِ نامش بسازید.',
      },
      {
        id: 'charge', target: 'finance-expense-charge', when: managesFinance,
        title: 'به حسابِ عضو',
        body: 'اگر این اشتراک برای یک عضو است، او را انتخاب کنید و سهمش را بدهید؛ هر بار «ثبت پرداخت» بزنید، سهمش به بدهی‌اش در «حسابِ اعضا» اضافه می‌شود.',
      },
      {
        id: 'submit', target: 'finance-expense-submit', when: managesFinance,
        title: 'ذخیرهٔ هزینه', body: 'با «ذخیره» هزینه ثبت می‌شود؛ تیکِ «نوبتِ اول همین حالا پرداخت شود» همان لحظه ردیفِ دفتر را هم می‌نویسد. «انصراف» فرم را بی‌ذخیره می‌بندد.',
      },
    ],
  },

  // ───────────────────────── ۹. حساب‌های بانکی ─────────────────────────
  {
    id: 'finance-accounts',
    title: 'حساب‌های بانکی',
    description: 'ساختنِ حساب، ماندهٔ اولیه، مشخصاتِ بانکی و حسابدارانِ هر حساب.',
    audience: managesFinance,
    order: 508,
    next: ['finance-vendors'],
    steps: [
      goFinance,
      {
        id: 'tab-accounts', target: 'finance-tabs', kind: 'click', path: '/finance',
        title: 'تبِ «حساب‌های بانکی»', body: 'روی تبِ «حساب‌های بانکی» بزنید؛ روی گوشی شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'table', target: 'finance-accounts-table', optional: true,
        title: 'فهرستِ حساب‌ها',
        body: 'نام، ارز، دفتر، ماندهٔ اولیه و ماندهٔ فعلیِ هر حساب. روی هر ردیف بزنید تا مشخصاتِ بانکی با دکمهٔ کپی باز شود.',
      },
      {
        id: 'add', target: 'finance-accounts-add', kind: 'click',
        title: 'دکمهٔ «افزودن حساب»', body: 'روی «افزودن حساب» بزنید.',
      },
      {
        id: 'form', target: 'finance-accounts-form',
        title: 'نام، ارز و نوع', body: 'نامِ حساب و ارزش را بدهید؛ نوع «کاری» یا «شخصی» است و می‌شود حساب را به یک دفتر وصل کرد.',
      },
      {
        id: 'opening', target: 'finance-accounts-opening',
        title: 'مانده اولیه', body: 'پولی که روزِ شروع در حساب بود. نقطهٔ شروعِ محاسبهٔ مانده است و ردیفی در دفتر نمی‌سازد.',
      },
      {
        id: 'bank', target: 'finance-accounts-bank',
        title: 'مشخصاتِ بانکی', body: 'نامِ بانک، صاحبِ حساب، شمارهٔ حساب، کارت و شبا — همه اختیاری؛ شبا و کارت با رقمِ کنترلی سنجیده می‌شوند.',
      },
      {
        id: 'accountants', target: 'finance-accounts-accountants',
        title: 'حسابدارانِ این حساب', body: 'کسی که فقط مجوزِ دیدنِ مالی دارد، تنها حساب‌هایی را می‌بیند که اینجا تیکِ او خورده است.',
      },
      {
        id: 'submit', target: 'finance-accounts-submit',
        title: 'ذخیرهٔ حساب', body: 'با «ذخیره» حساب ساخته می‌شود. تیکِ «حسابِ خصوصی» آن را فقط برای کسانی که دسترسیِ خصوصی دارند نشان می‌دهد.',
      },
      {
        id: 'cancel', target: 'finance-accounts-cancel', kind: 'click',
        title: 'بستنِ فرم', body: 'حالا «انصراف» را بزنید تا فرم بی‌ذخیره بسته شود.',
      },
    ],
  },

  // ───────────────────────── ۱۰. طرف‌حساب‌ها و دوره‌های بسته ─────────────────────────
  {
    id: 'finance-vendors',
    title: 'طرف‌حساب‌ها و دوره‌های بسته',
    description: 'فروشندگان و طرف‌حساب‌های هزینه، و دیدنِ دوره‌های مالیِ بسته‌شده.',
    audience: managesFinance,
    order: 509,
    next: ['reports-overview'],
    steps: [
      goFinance,
      {
        id: 'tab-vendors', target: 'finance-tabs', kind: 'click', path: '/finance',
        title: 'تبِ «طرف‌حساب‌ها»', body: 'روی تبِ «طرف‌حساب‌ها» بزنید؛ روی گوشی شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'list', target: 'finance-vendors',
        title: 'فهرستِ طرف‌حساب‌ها',
        body: 'فروشندگانی که به آن‌ها هزینه می‌پردازید. عددِ ستونِ «هزینه‌ها» را بزنید تا هزینه‌های همان طرف‌حساب باز شود. با «افزودن طرف‌حساب» یکی بسازید؛ طرف‌حسابِ غیرفعال دیگر پیشنهاد نمی‌شود.',
      },
      {
        id: 'closed', target: 'finance-tabs',
        title: 'دوره‌های بسته',
        body: 'وقتی دورهٔ مالی بسته شود، تبِ «دوره‌های بسته» پیدا می‌شود: جمعِ واریز و برداشت و ماندهٔ پایانِ هر حساب، با «ردیف‌ها» و «خروجی CSV». ردیف‌های آن دوره دیگر تغییر نمی‌کنند.',
      },
      {
        id: 'owner-fiscal', target: 'finance-tabs', when: (c) => c.isOwner,
        title: 'بستنِ دوره', body: 'بستن یا بازگشاییِ دوره از تنظیمات ← دورهٔ مالی انجام می‌شود؛ در تبِ «دوره‌های بسته» پیوندِ «مدیریتِ دورهٔ مالی» هم هست.',
      },
    ],
  },

  // ───────────────────────── ۱۱. گزارش‌های مالی ─────────────────────────
  {
    id: 'reports-overview',
    title: 'گزارش‌های مالی',
    description: 'گزارش کلی، بدهی به اعضا، مطالبات کارفرما، هزینه‌ها و نقدینگیِ حساب‌ها.',
    audience: seesReports,
    order: 520,
    next: ['reports-member-detail', 'reports-client-detail', 'reports-work'],
    steps: [
      goReports,
      {
        id: 'tabs', target: 'reports-tabs', path: '/reports',
        title: 'تب‌های گزارش', body: 'هر تب یک گزارش است. اگر تبی را نمی‌بینید، مدیر آن را برای شما پنهان کرده است.',
      },
      {
        id: 'tab-overall', target: 'reports-tabs', kind: 'click', path: '/reports',
        title: 'تبِ «گزارش کلی»', body: 'روی تبِ «گزارش کلی» بزنید.',
      },
      {
        id: 'overall', target: 'reports-overall', optional: true,
        title: 'گزارش کلی',
        body: 'ارزشِ پروژه‌ها، دریافتی و «مطالبات از کارفرما»، تعهد و «بدهی به اعضا»، ساعتِ کار و «سود تخمینی» — همه به یورو. اگر نرخِ ارزی کهنه یا غایب باشد، بالای کارت‌ها هشدار می‌آید.',
      },
      {
        id: 'recompute', target: 'reports-recompute', optional: true, when: (c) => c.isOwner || can(c, 'finance.manage'),
        title: 'بازمحاسبهٔ یورو', body: 'اگر نرخِ ارزی را دیر ثبت کرده‌اید، «بازمحاسبهٔ معادلِ یورو» معادلِ همهٔ ردیف‌ها را با نرخ‌های فعلی دوباره حساب می‌کند.',
      },
      {
        id: 'office', target: 'reports-office-filter', optional: true,
        title: 'فیلترِ دفتر', body: 'اگر چند دفتر دارید، دفترها را انتخاب و «اعمال» را بزنید تا ارقام فقط برای همان‌ها باشد.',
      },
      reportMembersTab,
      {
        id: 'members', target: 'reports-members', optional: true,
        title: 'بدهی به اعضا', body: 'تعهد، پرداختی و بدهیِ ما به هر عضو. روی نامِ هر عضو بزنید تا ریزِ پروژه‌به‌پروژه‌اش باز شود.',
      },
      {
        id: 'toolbar', target: 'reports-toolbar', optional: true,
        title: 'جستجو و خروجی', body: 'جعبهٔ جستجو داخلِ جدولِ همین تب می‌گردد و «خروجی CSV» همان جدول را دانلود می‌کند.',
      },
      reportClientsTab,
      {
        id: 'clients', target: 'reports-clients', optional: true,
        title: 'مطالبات از کارفرما', body: 'برای هر کارفرما: صورتحساب‌شده (قیمتِ پروژه‌ها به‌علاوهٔ هزینه‌های قابلِ بازپرداخت)، دریافتی و طلب. روی نامش بزنید تا ریزِ هر پروژه را ببینید.',
      },
      {
        id: 'tab-expenses', target: 'reports-tabs', kind: 'click', path: '/reports',
        title: 'تبِ «هزینه‌ها»', body: 'روی تبِ «هزینه‌ها» بزنید؛ شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'expenses', target: 'reports-expenses', optional: true,
        title: 'گزارشِ هزینه‌ها', body: 'بازهٔ زمانی را از بالا انتخاب کنید؛ جمع، میانگینِ ماهانه، و تفکیک به طرف‌حساب و ماه، همراهِ ردیف‌های دفتر.',
      },
      {
        id: 'tab-accounts', target: 'reports-tabs', kind: 'click', path: '/reports',
        title: 'تبِ «حساب‌ها و نقدینگی»', body: 'روی تبِ «حساب‌ها و نقدینگی» بزنید؛ شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'accounts', target: 'reports-accounts', optional: true,
        title: 'نقدینگی', body: 'ماندهٔ هر حساب و معادلِ یوروی آن؛ یک نگاه به اینکه الان چقدر پول دارید.',
      },
    ],
  },

  // ───────────────────────── ۱۲. ریزِ یک عضو ─────────────────────────
  {
    id: 'reports-member-detail',
    title: 'ریزِ حسابِ یک عضو',
    description: 'از گزارش به صفحهٔ یک عضو بروید و تعهد و پرداخت‌ها را پروژه‌به‌پروژه ببینید.',
    audience: seesReports,
    order: 521,
    next: ['reports-client-detail'],
    steps: [
      goReports,
      reportMembersTab,
      {
        id: 'member-link', target: 'reports-member-link', kind: 'click', advanceOnPath: '/reports/member/', path: '/reports',
        title: 'یک عضو', body: 'روی نامِ یکی از اعضا بزنید.',
      },
      {
        id: 'member-cards', target: 'reports-member-cards', path: '/reports/member/',
        title: 'خلاصهٔ عضو', body: 'تعهدِ کل، پرداخت‌شده و بدهی به این عضو (یورو)، و زیرش پروژه‌ها، ساعتِ این هفته و تسک‌هایش.',
      },
      {
        id: 'member-projects', target: 'reports-member-projects', path: '/reports/member/', optional: true,
        title: 'پروژه‌به‌پروژه', body: 'برای هر پروژه قرارداد، پرداخت‌ها و مانده؛ ردیف‌های پرداخت با تاریخ و رسید زیرِ هر پروژه آمده‌اند.',
      },
    ],
  },

  // ───────────────────────── ۱۳. ریزِ یک کارفرما ─────────────────────────
  {
    id: 'reports-client-detail',
    title: 'مطالباتِ یک کارفرما',
    description: 'از گزارش به صفحهٔ یک کارفرما بروید و طلبِ هر پروژه را ببینید.',
    audience: seesReports,
    order: 522,
    next: ['reports-work'],
    steps: [
      goReports,
      reportClientsTab,
      {
        id: 'client-link', target: 'reports-client-link', kind: 'click', advanceOnPath: '/reports/client/', path: '/reports',
        title: 'یک کارفرما', body: 'روی نامِ یکی از کارفرماها بزنید.',
      },
      {
        id: 'client-cards', target: 'reports-client-cards', path: '/reports/client/',
        title: 'خلاصهٔ کارفرما', body: 'ارزشِ کل، دریافتی و ماندهٔ طلب از این کارفرما (یورو).',
      },
      {
        id: 'client-projects', target: 'reports-client-projects', path: '/reports/client/', optional: true,
        title: 'مطالباتِ هر پروژه', body: 'قیمت، هزینه‌های قابلِ صورت‌حساب، دریافت‌شده و ماندهٔ هر پروژه؛ همان که باید از کارفرما بگیرید.',
      },
    ],
  },

  // ───────────────────────── ۱۴. گزارش‌های کار و حضور ─────────────────────────
  {
    id: 'reports-work',
    title: 'گزارشِ ساعت، پروژه‌ها و حضور',
    description: 'ساعتِ کاری، گزارشِ پروژه‌ها، کارکردِ تعدادی، حضور و مرخصی، و دوره‌های بسته‌شده.',
    audience: seesReports,
    order: 523,
    steps: [
      goReports,
      {
        id: 'tab-hours', target: 'reports-tabs', kind: 'click', path: '/reports',
        title: 'تبِ «ساعت کاری»', body: 'روی تبِ «ساعت کاری» بزنید؛ شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'range', target: 'reports-range', optional: true,
        title: 'بازهٔ زمانی', body: 'یکی از بازه‌های آماده را بزنید یا «از» و «تا» را بدهید و «اعمال» کنید.',
      },
      {
        id: 'hours', target: 'reports-hours', optional: true,
        title: 'ساعتِ هر عضو', body: 'ساعت‌های ثبت‌شدهٔ هر عضو در این بازه؛ روی نام بزنید تا ریزِ ساعت‌هایش باز شود.',
      },
      {
        id: 'tab-projects', target: 'reports-tabs', kind: 'click', path: '/reports',
        title: 'تبِ «گزارش پروژه‌ها»', body: 'روی تبِ «گزارش پروژه‌ها» بزنید؛ شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'projects', target: 'reports-projects', optional: true,
        title: 'پروژه‌ها', body: 'قیمت، دریافتی، هزینه، پرداخت به اعضا و سودِ هر پروژه؛ نامِ پروژه شما را به تبِ مالیِ همان پروژه می‌برد.',
      },
      {
        id: 'tab-units', target: 'reports-tabs', kind: 'click', path: '/reports',
        title: 'تبِ «کارکردِ تعدادی»', body: 'روی تبِ «کارکردِ تعدادی» بزنید؛ شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'units', target: 'reports-units', optional: true,
        title: 'کارکردِ تعدادی', body: 'برای پروژه‌های تعدادی: کارکردِ پرداخت‌شده و پرداخت‌نشدهٔ هر عضو.',
      },
      {
        id: 'tab-attendance', target: 'reports-tabs', kind: 'click', path: '/reports',
        title: 'تبِ «حضور و مرخصی»', body: 'روی تبِ «حضور و مرخصی» بزنید؛ شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'attendance', target: 'reports-attendance', optional: true,
        title: 'حضور و مرخصی', body: 'اول اعضایی که برنامهٔ هفتگی ثبت نکرده‌اند، بعد مرخصی‌های ثبت‌شده.',
      },
      {
        id: 'tab-closings', target: 'reports-tabs', kind: 'click', path: '/reports',
        title: 'تبِ «دوره‌های بسته‌شده»', body: 'روی تبِ «دوره‌های بسته‌شده» بزنید؛ شاید زیرِ «بیشتر» باشد.',
      },
      {
        id: 'closings', target: 'reports-closings', optional: true,
        title: 'دوره‌های بسته‌شده', body: 'خلاصهٔ هر حساب در روزِ بستنِ دوره؛ تاریخ را از بالا انتخاب کنید. «کهنه» یعنی دوره بعداً بازگشایی شده است.',
      },
      { id: 'bye', title: 'پایانِ گزارش‌ها', body: 'همهٔ راهنماها در منوی کاربر ← «راهنمای برنامه» هستند.' },
    ],
  },
];
