import { can, type Tour, type TourCtx } from '../types';

/** راهنماهای بخشِ «comms» — پیام‌ها، جلسات و کتابخانهٔ کد. */

/** کسی که صفحهٔ «پیام‌ها» را دارد (همان قاعدهٔ منو: عضو، کارفرما یا مجوزِ پیام). */
const seesMessages = (c: TourCtx) =>
  c.isOwner || c.isMember || c.roles.includes('client') || can(c, 'messages.read') || can(c, 'messages.send');
/** مدیر (مالک/ادمین): «کانالِ تازه» و پخشِ همگانی دارد و «پیام به مدیریت» ندارد. */
const isManager = (c: TourCtx) => c.isOwner || c.roles.includes('owner') || c.roles.includes('admin');
/** عضوِ تیم (نه کارفرمای خالص) — کانال‌ها و گروه‌های پروژه. */
const isTeam = (c: TourCtx) => !c.isClientOnly && (c.isOwner || c.isMember || c.roles.includes('admin'));
/** کسی که صفحهٔ «جلسات» را دارد. */
const seesMeetings = (c: TourCtx) =>
  c.isOwner || c.isMember || c.roles.includes('client') || can(c, 'meetings.view');
/** کسی که دکمهٔ «جلسهٔ جدید» دارد (مدیرِ سراسری، مدیرِ دفتر یا مدیرِ پروژه). */
const makesMeetings = (c: TourCtx) =>
  c.isOwner || can(c, 'meetings.manage') || can(c, 'projects.manage') || c.managesTeam || c.isPm;
/** کتابخانهٔ کد مالِ تیم است: مالک، ادمین و عضو (نه مالی و نه کارفرما). */
const usesLibrary = (c: TourCtx) => c.roles.some((r) => r === 'owner' || r === 'admin' || r === 'member');

export const tours: Tour[] = [
  /* ------------------------------------------------------------------ *
   * پیام‌ها
   * ------------------------------------------------------------------ */
  {
    id: 'comms-messages-basics',
    title: 'صندوقِ پیام‌ها',
    description: 'گفتگوها را پیدا کنید، بخوانید، پاسخ بدهید و پیامِ خودتان را ویرایش کنید.',
    audience: seesMessages,
    order: 60,
    next: ['comms-messages-new', 'comms-messages-peer', 'comms-messages-management', 'comms-channels'],
    steps: [
      { id: 'nav', target: 'nav-messages', kind: 'click', advanceOnPath: '/messages', title: 'منوی پیام‌ها', body: 'روی «پیام‌ها» بزنید تا صندوقِ پیامِ شما باز شود.' },
      { id: 'search', target: 'messages-search', path: '/messages', title: 'جستجوی گفتگو', body: 'نامِ طرفِ گفتگو یا تکه‌ای از متنِ پیام را بنویسید تا فهرست کوتاه شود.' },
      { id: 'tabs', target: 'messages-tabs', path: '/messages', title: 'همه، اعضا، خوانده‌نشده', body: '«همه» کلِ گفتگوهاست و «خوانده‌نشده» فقط آنچه هنوز ندیده‌اید. اگر پیامِ خصوصی با همکاران دارید، زبانهٔ «اعضا» هم هست.' },
      { id: 'inbox', target: 'messages-inbox', path: '/messages', title: 'صندوق', body: 'گفتگوها در سه بخش‌اند: «کانال‌های تیم»، «گروه‌های پروژه» و «گفتگوها». عددِ رنگیِ کنارِ هر ردیف یعنی پیامِ خوانده‌نشده.' },
      { id: 'open', target: 'messages-row', kind: 'click', path: '/messages', optional: true, title: 'باز کردنِ گفتگو', body: 'روی یکی از گفتگوها بزنید تا پیام‌هایش کنار باز شود.' },
      { id: 'header', target: 'messages-thread-header', path: '/messages', optional: true, title: 'سربرگِ گفتگو', body: 'نامِ طرفِ گفتگو اینجاست. اگر نوشته «اعلان یک‌طرفه»، نمی‌شود به آن پاسخ داد. سطلِ زباله گفتگو را از صندوقِ شما برمی‌دارد و پیش از آن تأیید می‌خواهد.' },
      { id: 'list', target: 'messages-thread-list', path: '/messages', optional: true, title: 'پیام‌ها', body: 'پیام‌های شما یک سمت و رنگی‌اند. روی ساعتِ هر پیام بمانید تا زمانِ دقیق را ببینید.' },
      { id: 'reply', target: 'messages-reply-btn', kind: 'click', path: '/messages', optional: true, title: 'پاسخ به یک پیامِ مشخص', body: 'زیرِ هر پیام این پیکان هست. بزنید تا پیامتان «در پاسخ به» همان پیام فرستاده شود.' },
      { id: 'composer', target: 'messages-composer', path: '/messages', optional: true, title: 'نوشتنِ پاسخ', body: 'متن را اینجا بنویسید. Enter خطِ تازه است و Ctrl+Enter یا دکمهٔ «ارسال» پیام را می‌فرستد. با ضربدرِ نوارِ «در پاسخ به» پاسخ لغو می‌شود.' },
      { id: 'edit', target: 'messages-edit-btn', path: '/messages', optional: true, title: 'ویرایشِ پیامِ خودتان', body: 'با این مداد پیامِ خودتان را تا ۲۴ ساعت ویرایش کنید؛ زیرش «ویرایش‌شده» می‌آید. Esc ویرایش را لغو می‌کند.' },
      { id: 'done', title: 'همین بود', body: 'پیامِ تازه همان لحظه در صندوق می‌آید و در زنگولهٔ اعلان‌ها هم خبرش را می‌گیرید.' },
    ],
  },
  {
    id: 'comms-messages-new',
    title: 'فرستادنِ پیامِ جدید',
    description: 'به یک یا چند نفر پیام بدهید؛ هر گیرنده گفتگوی جدای خودش را می‌گیرد.',
    audience: (c) => can(c, 'messages.send'),
    order: 61,
    next: ['comms-channel-create'],
    steps: [
      { id: 'nav', target: 'nav-messages', kind: 'click', advanceOnPath: '/messages', title: 'منوی پیام‌ها', body: 'روی «پیام‌ها» بزنید.' },
      { id: 'new', target: 'messages-new', kind: 'click', path: '/messages', title: 'پیام جدید', body: 'روی «پیام جدید» بزنید تا پنجرهٔ نوشتنِ پیام باز شود.' },
      { id: 'audience', target: 'messages-compose-audience', optional: true, when: isManager, title: 'به چه کسانی؟', body: '«افرادِ مشخص» را بزنید تا خودتان انتخاب کنید، یا یکی از مخاطب‌های آماده مثلِ «همهٔ اعضا» را؛ برای اعضا می‌شود دفتر را هم محدود کرد.' },
      { id: 'recipients', target: 'messages-compose-recipients', optional: true, title: 'گیرندگان', body: 'با «دفتر» و «پروژه» فهرست را باریک کنید و نام را جستجو کنید. با انتخابِ پروژه اعضای تیمش خودکار تیک می‌خورند؛ هر کس را نخواستید تیکش را بردارید.' },
      { id: 'body', target: 'messages-compose-body', title: 'متنِ پیام', body: 'پیام را بنویسید. اگر جوابی نمی‌خواهید، تیکِ «پاسخ مجاز باشد» را بردارید تا اعلانِ یک‌طرفه شود.' },
      { id: 'send', title: 'فرستادن', body: 'دکمهٔ «ارسال به … نفر» پیام را می‌فرستد؛ عددش نشان می‌دهد به چند نفر می‌رسد. گیرنده‌ها همدیگر را نمی‌بینند.' },
    ],
  },
  {
    id: 'comms-messages-peer',
    title: 'پیامِ خصوصی به یک همکار',
    description: 'گفتگوی دونفره با عضوِ دیگرِ تیم که فقط شما دو نفر می‌بینید.',
    audience: (c) => c.isMember && !c.isClientOnly,
    order: 62,
    steps: [
      { id: 'nav', target: 'nav-messages', kind: 'click', advanceOnPath: '/messages', title: 'منوی پیام‌ها', body: 'روی «پیام‌ها» بزنید.' },
      { id: 'open', target: 'messages-peer', kind: 'click', path: '/messages', optional: true, title: 'پیام به یک عضو', body: 'روی «پیام به یک عضو» بزنید. اگر این دکمه نیست، پیامِ بینِ اعضا در تنظیمات خاموش است.' },
      { id: 'to', target: 'messages-peer-to', optional: true, title: 'گیرنده', body: 'نامِ همکار را جستجو و انتخاب کنید. اگر قبلاً با او گفتگو کرده‌اید، پیام به همان گفتگو اضافه می‌شود.' },
      { id: 'body', target: 'messages-peer-body', optional: true, title: 'متنِ پیام', body: 'پیام را بنویسید و با «ارسال» یا Ctrl+Enter بفرستید. مدیران هم این گفتگو را نمی‌بینند.' },
      { id: 'tab', title: 'زبانهٔ «اعضا»', body: 'گفتگوهای خصوصی با همکاران را در صندوق، زیرِ زبانهٔ «اعضا» جدا پیدا می‌کنید.' },
    ],
  },
  {
    id: 'comms-messages-management',
    title: 'پیام به مدیریت',
    description: 'سؤال یا درخواستتان را بی‌انتخابِ گیرنده به همهٔ مدیران بفرستید.',
    audience: (c) => seesMessages(c) && !isManager(c),
    order: 63,
    steps: [
      { id: 'nav', target: 'nav-messages', kind: 'click', advanceOnPath: '/messages', title: 'منوی پیام‌ها', body: 'روی «پیام‌ها» بزنید.' },
      { id: 'open', target: 'messages-mgmt', kind: 'click', path: '/messages', title: 'پیام به مدیریت', body: 'روی «پیام به مدیریت» بزنید.' },
      { id: 'body', target: 'messages-mgmt-body', title: 'متنِ پیام', body: 'پیام در یک گفتگوی مشترک به همهٔ مدیران می‌رسد و هر کدام می‌توانند پاسخ بدهند. لازم نیست گیرنده انتخاب کنید.' },
      { id: 'send', title: 'فرستادن', body: 'با «ارسال» یا Ctrl+Enter پیام فرستاده می‌شود و پاسخ‌ها با نامِ «مدیریت» در صندوقِ شما می‌آیند.' },
    ],
  },
  {
    id: 'comms-channels',
    title: 'کانال‌ها، گروه‌ها و منشن',
    description: 'کانال‌های تیم و گروه‌های پروژه، صدا زدنِ همکار با @ و بی‌صدا کردنِ گروه.',
    audience: isTeam,
    order: 64,
    next: ['comms-project-group'],
    steps: [
      { id: 'nav', target: 'nav-messages', kind: 'click', advanceOnPath: '/messages', title: 'منوی پیام‌ها', body: 'روی «پیام‌ها» بزنید.' },
      { id: 'intro', path: '/messages', title: 'گفتگوی گروهی', body: '«کانالِ تیم» برای همهٔ اعضا، یک نقش یا یک دفتر است. «گروهِ پروژه» اعضای همان پروژه را دارد. کارفرما عضوِ هیچ‌کدام نیست.' },
      { id: 'channel', target: 'messages-channel-row', kind: 'click', path: '/messages', optional: true, title: 'یک کانال را باز کنید', body: 'روی یکی از کانال‌های تیم بزنید.' },
      { id: 'header', target: 'messages-thread-header', path: '/messages', optional: true, title: 'سربرگِ گروه', body: 'شمارِ اعضا و مدتی که پیام‌ها می‌مانند اینجاست. در گروهِ پروژه پیوندِ «صفحهٔ پروژه» هم هست.' },
      { id: 'mute', target: 'messages-thread-mute', path: '/messages', optional: true, title: 'بی‌صدا کردن', body: 'با زنگوله اعلان‌های این گروه را فقط برای خودتان خاموش کنید. اگر کسی شما را منشن کند، باز هم خبر می‌گیرید.' },
      { id: 'mention', target: 'messages-composer', path: '/messages', optional: true, title: 'منشن با @', body: '«@» بنویسید تا فهرستِ اعضای همین گروه باز شود؛ با بالا و پایین و Enter یکی را انتخاب کنید. مدیران «@همه» هم دارند. کسی که منشن شود اعلان می‌گیرد.' },
      { id: 'project', target: 'messages-project-row', kind: 'click', path: '/messages', optional: true, title: 'گروهِ پروژه', body: 'حالا روی یکی از «گروه‌های پروژه» بزنید.' },
      { id: 'lock', target: 'messages-thread-lock', path: '/messages', optional: true, when: (c) => isManager(c) || c.isPm || c.managesTeam, title: 'قفلِ گروه', body: 'مدیر و مدیرِ پروژه با قفل، گروه را فقط‌خواندنی می‌کنند. گروهِ پروژهٔ تمام‌شده یا بایگانی‌شده هم خودش فقط‌خواندنی می‌شود.' },
      { id: 'delete', target: 'messages-thread-delete', path: '/messages', optional: true, when: isManager, title: 'حذفِ پیام یا گروه', body: 'هر کس پیامِ خودش را در گروه حذف می‌کند؛ مدیر هر پیام و کلِ گروه را. حذف پیش از اجرا تأیید می‌خواهد.' },
      { id: 'done', title: 'آماده‌اید', body: 'پیامِ عادی در کانال اعلانی نمی‌فرستد؛ در گروهِ پروژه اعلانِ جمع‌شده می‌آید.' },
    ],
  },
  {
    id: 'comms-project-group',
    title: 'گروهِ گفتگوی پروژه',
    description: 'همان گروهِ پروژه را از داخلِ صفحهٔ خودِ پروژه ببینید و بنویسید.',
    audience: isTeam,
    order: 65,
    steps: [
      { id: 'nav', target: 'nav-projects', kind: 'click', advanceOnPath: '/projects', title: 'منوی پروژه‌ها', body: 'روی «پروژه‌ها» بزنید.' },
      { id: 'card', target: 'projects-card', kind: 'click', path: '/projects', advanceOnPath: '/projects/', optional: true, title: 'یک پروژه را باز کنید', body: 'روی یکی از پروژه‌ها بزنید.' },
      { id: 'tab', target: 'project-tab-chat', kind: 'click', path: '/projects/', optional: true, title: 'گروهِ گفتگو', body: 'روی تبِ «گروهِ گفتگو» بزنید. اگر این تب نیست، هنوز گروهی برای این پروژه ساخته نشده یا شما عضوِ تیمِ پروژه نیستید.' },
      { id: 'composer', target: 'messages-composer', path: '/projects/', optional: true, title: 'همان گفتگو', body: 'این همان گروهی است که در «پیام‌ها» هم هست؛ هر چه اینجا بنویسید آنجا هم دیده می‌شود. منشن با @ اینجا هم کار می‌کند.' },
    ],
  },
  {
    id: 'comms-channel-create',
    title: 'ساختِ کانالِ تیم',
    description: 'کانالی برای همهٔ اعضا، یک نقش یا یک دفتر بسازید.',
    audience: isManager,
    order: 66,
    steps: [
      { id: 'nav', target: 'nav-messages', kind: 'click', advanceOnPath: '/messages', title: 'منوی پیام‌ها', body: 'روی «پیام‌ها» بزنید.' },
      { id: 'open', target: 'messages-channel-new', kind: 'click', path: '/messages', title: 'کانالِ تازه', body: 'روی «کانالِ تازه» بزنید.' },
      { id: 'title', target: 'messages-channel-title', title: 'نامِ کانال', body: 'یک نامِ روشن بگذارید، مثلاً «عمومیِ تیم».' },
      { id: 'audience', target: 'messages-channel-audience', title: 'مخاطب', body: '«همهٔ اعضا»، «یک نقش» یا «یک دفتر». عضویت زنده است: هر کس بعداً آن نقش یا دفتر را بگیرد خودکار عضو می‌شود.' },
      { id: 'announce', target: 'messages-channel-announce', title: 'فقط اعلان', body: 'با این تیک فقط مدیران در کانال می‌نویسند و بقیه فقط می‌خوانند.' },
      { id: 'save', title: 'ساختن', body: 'با «ساختِ کانال» کانال ساخته و همان‌جا باز می‌شود. «پیامِ اول» اختیاری است.' },
    ],
  },

  /* ------------------------------------------------------------------ *
   * جلسات
   * ------------------------------------------------------------------ */
  {
    id: 'comms-meetings-view',
    title: 'جلسه‌های من',
    description: 'جلسه‌های پیشِ‌رو را ببینید، جزئیاتشان را باز کنید و به تقویمتان اضافه کنید.',
    audience: seesMeetings,
    order: 70,
    next: ['comms-meetings-create', 'comms-meetings-reminders'],
    steps: [
      { id: 'nav', target: 'nav-meetings', kind: 'click', advanceOnPath: '/meetings', title: 'منوی جلسات', body: 'روی «جلسات» بزنید.' },
      { id: 'tabs', target: 'meetings-tabs', path: '/meetings', title: 'جلسات و یادآورها', body: '«جلسات» جلسه‌های پیشِ‌روی شماست و «یادآورهای من» یادداشت‌های شخصیِ زمان‌دار.' },
      { id: 'list', target: 'meetings-list', path: '/meetings', optional: true, title: 'فهرستِ جلسه‌ها', body: 'هر کارت موضوع، تاریخ و ساعت، مکان و دعوت‌شدگان را دارد. نشانِ گوشه نامِ پروژه یا دفترِ جلسه است.' },
      { id: 'calendar', target: 'meetings-calendar', path: '/meetings', optional: true, title: 'افزودن به تقویم', body: 'با «افزودن به تقویم» جلسه را در تقویمِ گوگل، اوت‌لوک یا تقویمِ گوشی (با فایل) بگذارید تا یادتان نرود.' },
      { id: 'card', target: 'meetings-card', kind: 'click', path: '/meetings', optional: true, title: 'جزئیاتِ جلسه', body: 'روی یکی از کارت‌ها بزنید تا جزئیاتِ کاملش باز شود.' },
      { id: 'detail', target: 'meetings-detail', optional: true, title: 'همهٔ جزئیات', body: 'تاریخ و ساعت به وقتِ شما، توضیحات و پیوندِ پروژهٔ جلسه همه اینجاست.' },
      { id: 'join', target: 'meetings-detail-location', optional: true, title: 'پیوستن به جلسه', body: 'اگر جلسه آنلاین است، مکان یک پیوند است؛ سرِ وقت رویش بزنید تا وارد جلسه شوید.' },
      { id: 'attendees', target: 'meetings-detail-attendees', optional: true, title: 'دعوت‌شدگان', body: 'همهٔ کسانی که به این جلسه دعوت شده‌اند. با «بستن» به فهرست برمی‌گردید.' },
    ],
  },
  {
    id: 'comms-meetings-create',
    title: 'ساختنِ جلسه',
    description: 'جلسهٔ پروژه یا جلسهٔ عمومیِ تیم بگذارید و افراد را دعوت کنید.',
    audience: makesMeetings,
    order: 71,
    steps: [
      { id: 'nav', target: 'nav-meetings', kind: 'click', advanceOnPath: '/meetings', title: 'منوی جلسات', body: 'روی «جلسات» بزنید.' },
      { id: 'edit', target: 'meetings-edit', path: '/meetings', optional: true, title: 'ویرایش و حذف', body: 'روی جلسه‌ای که خودتان (یا پروژه‌تان) ساخته‌اید «ویرایش» و «حذف» هست. حذف پیش از اجرا تأیید می‌خواهد.' },
      { id: 'new', target: 'meetings-new', kind: 'click', path: '/meetings', title: 'جلسهٔ جدید', body: 'روی «جلسهٔ جدید» بزنید.' },
      { id: 'kind', target: 'meetings-form-kind', title: 'نوعِ جلسه', body: '«مرتبط با پروژه» یا «عمومی / تیمی». جلسهٔ عمومی فقط برای مدیران و مدیرِ دفتر است. نوع پس از ساخت عوض نمی‌شود.' },
      { id: 'scope', target: 'meetings-form-scope', title: 'پروژه یا دفتر', body: 'نامِ پروژه را تایپ و انتخاب کنید؛ برای جلسهٔ عمومی دفتر را. فهرستِ دعوت‌شدگان از همین انتخاب ساخته می‌شود.' },
      { id: 'title', target: 'meetings-form-title', title: 'موضوع', body: 'موضوعِ جلسه را کوتاه بنویسید، مثلاً «بررسی پیشرفت پروژه».' },
      { id: 'when', target: 'meetings-form-when', title: 'تاریخ و ساعت', body: 'روز و ساعتِ جلسه را انتخاب کنید؛ هر دعوت‌شده آن را به وقتِ خودش می‌بیند.' },
      { id: 'location', target: 'meetings-form-location', title: 'مکان', body: 'نشانیِ دفتر یا پیوندِ جلسهٔ آنلاین را بگذارید؛ پیوند برای دعوت‌شدگان قابلِ کلیک می‌شود.' },
      { id: 'desc', target: 'meetings-form-desc', title: 'توضیحات', body: 'دستورِ جلسه یا هر نکته‌ای که باید پیش از جلسه بدانند. اختیاری است.' },
      { id: 'attendees', target: 'meetings-form-attendees', title: 'دعوت‌شدگان', body: 'افراد را تیک بزنید، یا «انتخاب همه» و «هیچ‌کدام». به هر دعوت‌شده اعلان می‌رسد.' },
      { id: 'save', target: 'meetings-form-save', title: 'ذخیره', body: 'با «ایجاد جلسه» جلسه ثبت و دعوت فرستاده می‌شود؛ «انصراف» چیزی ذخیره نمی‌کند.' },
    ],
  },
  {
    id: 'comms-meetings-reminders',
    title: 'یادآورهای من',
    description: 'یادداشتی برای زمانی در آینده بگذارید تا سرِ موعد خبرتان کنیم.',
    audience: seesMeetings,
    order: 72,
    steps: [
      { id: 'nav', target: 'nav-meetings', kind: 'click', advanceOnPath: '/meetings', title: 'منوی جلسات', body: 'روی «جلسات» بزنید.' },
      { id: 'tab', target: 'meetings-tab-reminders', kind: 'click', path: '/meetings', title: 'یادآورهای من', body: 'روی «یادآورهای من» بزنید.' },
      { id: 'form', target: 'meetings-reminder-form', path: '/meetings', title: 'یادآورِ تازه', body: '«تاریخ و ساعت» و «متن یادآور» را بنویسید. یادآور شخصی است و فقط خودتان می‌بینید.' },
      { id: 'leads', target: 'meetings-reminder-leads', path: '/meetings', title: 'چه زمانی یادآوری شود؟', body: 'می‌توانید چند زمان را با هم تیک بزنید، مثلاً سرِ موعد و کمی زودتر. بعد «ثبت یادآور» را بزنید.' },
      { id: 'list', target: 'meetings-reminder-list', path: '/meetings', optional: true, title: 'فهرستِ یادآورها', body: 'وضعیتِ هر یادآور («در انتظار» یا «ارسال‌شده») کنارش است. یادآورها یک هفته پس از موعد خودکار پاک می‌شوند.' },
    ],
  },

  /* ------------------------------------------------------------------ *
   * کتابخانهٔ کد
   * ------------------------------------------------------------------ */
  {
    id: 'comms-library-browse',
    title: 'گشتن در کتابخانهٔ کد',
    description: 'کدها، راهنماهای کارفرما و یادداشت‌های تیم را پیدا کنید.',
    audience: usesLibrary,
    order: 75,
    next: ['comms-library-entry', 'comms-library-create'],
    steps: [
      { id: 'nav', target: 'nav-library', kind: 'click', advanceOnPath: '/library', title: 'کتابخانهٔ کد', body: 'روی «کتابخانهٔ کد» بزنید.' },
      { id: 'kinds', target: 'library-kinds', path: '/library', title: 'نوعِ مورد', body: '«کد» برای تکه‌کدهای اختصاصی، «راهنمای کارفرما» برای آموزشِ کارفرما و «آموزش و یادداشت» برای تیم. عددِ کنارِ هر کدام شمارِ آن نوع است.' },
      { id: 'categories', target: 'library-categories', path: '/library', optional: true, title: 'دسته‌ها', body: 'با زدنِ هر دسته فقط همان دسته می‌ماند؛ دوباره بزنید تا برداشته شود.' },
      { id: 'search', target: 'library-search', path: '/library', title: 'جستجو', body: 'در عنوان، توضیح و حتی داخلِ خودِ کد جستجو می‌شود.' },
      { id: 'filters', target: 'library-filters', path: '/library', title: 'فیلترها', body: 'پلتفرم، برچسب و پروژه را انتخاب کنید. فیلترها در نشانیِ صفحه می‌مانند، پس می‌توانید پیوندش را برای همکار بفرستید.' },
      { id: 'mine', target: 'library-mine', path: '/library', title: 'نوشته‌های من', body: 'فقط موردهایی که خودتان نوشته‌اید. «بایگانی» هم موردهای کنارگذاشته را نشان می‌دهد.' },
      { id: 'review', target: 'library-review', path: '/library', optional: true, title: 'پیشنهادهای منتظرِ من', body: 'همکاران برای نوشته‌های شما پیشنهادِ ویرایش فرستاده‌اند؛ اینجا پیدایشان می‌کنید.' },
      { id: 'list', target: 'library-list', path: '/library', optional: true, title: 'کارت‌ها', body: 'هر کارت پلتفرم، زبانِ کد، نویسنده و شمارِ پروژه‌هایی که رویشان نصب است را دارد. «کارفرما می‌بیند» یعنی این راهنما به کارفرما نشان داده می‌شود.' },
      { id: 'card', target: 'library-card', kind: 'click', path: '/library', advanceOnPath: '/library/', optional: true, title: 'باز کردنِ یک مورد', body: 'روی یکی از کارت‌ها بزنید تا صفحهٔ کاملش باز شود.' },
    ],
  },
  {
    id: 'comms-library-entry',
    title: 'صفحهٔ یک موردِ کتابخانه',
    description: 'آموزشِ کامل، کارتِ سریع، کپیِ کد، تاریخچه و پیشنهادِ ویرایش.',
    audience: usesLibrary,
    order: 76,
    next: ['comms-library-install'],
    steps: [
      { id: 'nav', target: 'nav-library', kind: 'click', advanceOnPath: '/library', title: 'کتابخانهٔ کد', body: 'روی «کتابخانهٔ کد» بزنید.' },
      { id: 'card', target: 'library-card', kind: 'click', path: '/library', advanceOnPath: '/library/', optional: true, title: 'یک مورد را باز کنید', body: 'روی یکی از کارت‌ها بزنید.' },
      { id: 'mode', target: 'library-entry-mode', path: '/library/', optional: true, title: 'آموزشِ کامل یا کارتِ سریع', body: '«آموزشِ کامل» گام‌به‌گام و با تصویر است؛ «کارتِ سریع» فقط کدها و گزینه‌ها را برای کسی که بلد است جمع می‌کند.' },
      { id: 'content', target: 'library-entry-content', path: '/library/', title: 'محتوا', body: 'ویدیوی آموزشی، هشدارها، پیش‌نیازها، گام‌ها و کدها اینجاست. روی تصویرها بزنید تا بزرگ شوند.' },
      { id: 'copy', target: 'library-copy', path: '/library/', optional: true, title: 'کپیِ کد', body: 'با «کپی» هر تکه‌کد را بردارید؛ دکمهٔ «کپیِ همهٔ کدها» همه را یک‌جا کپی می‌کند. روی نامِ گزینه‌ها هم که بزنید کپی می‌شوند.' },
      { id: 'aside', target: 'library-entry-aside', path: '/library/', title: 'کنارِ صفحه', body: 'پروژه‌هایی که این مورد رویشان نصب است، «دربارهٔ این مورد» (نویسنده و تاریخ‌ها)، نسخه‌ها و موردهای مرتبط.' },
      { id: 'history', target: 'library-history', path: '/library/', optional: true, title: 'تاریخچه', body: 'نسخهٔ پیش از هر ویرایش نگه داشته می‌شود؛ بازش کنید تا ببینید یا بازگردانید.' },
      { id: 'suggestions', target: 'library-suggestions', path: '/library/', optional: true, title: 'پیشنهادها', body: 'تغییرهایی که همکاران فرستاده‌اند. نویسنده تفاوت را می‌بیند و «پذیرفتن و اعمال» یا «رد» می‌کند.' },
      { id: 'suggest', target: 'library-entry-suggest', path: '/library/', optional: true, title: 'پیشنهادِ ویرایش', body: 'این مورد را کسِ دیگری نوشته؛ با «پیشنهادِ ویرایش» بهترش کنید. تغییر مستقیم ذخیره نمی‌شود و نویسنده تأییدش می‌کند.' },
      { id: 'edit', target: 'library-entry-edit', path: '/library/', optional: true, title: 'ویرایش', body: 'نوشتهٔ خودتان را با «ویرایش» عوض کنید. از منوی «بیشتر» هم می‌شود بایگانی یا حذف کرد.' },
    ],
  },
  {
    id: 'comms-library-install',
    title: 'نصب روی پروژه',
    description: 'ثبت کنید این کد یا راهنما روی کدام پروژه و کجای سایت نصب است.',
    audience: usesLibrary,
    order: 77,
    steps: [
      { id: 'nav', target: 'nav-library', kind: 'click', advanceOnPath: '/library', title: 'کتابخانهٔ کد', body: 'روی «کتابخانهٔ کد» بزنید.' },
      { id: 'card', target: 'library-card', kind: 'click', path: '/library', advanceOnPath: '/library/', optional: true, title: 'یک مورد را باز کنید', body: 'روی کارتِ موردی بزنید که روی پروژه‌ای نصبش کرده‌اید.' },
      { id: 'list', target: 'library-install-list', path: '/library/', optional: true, title: 'پروژه‌های نصب‌شده', body: 'هر پروژه با یادداشتِ «کجای سایت» و مقدارهای خودش. از منوی «بیشتر» ِ هر ردیف می‌شود یادداشت را عوض کرد یا «نسخهٔ جدا برای این پروژه» ساخت.' },
      { id: 'add', target: 'library-install-add', kind: 'click', path: '/library/', optional: true, title: 'پروژهٔ دیگر', body: 'روی «پروژهٔ دیگر» بزنید تا نصبِ تازه ثبت کنید.' },
      { id: 'dialog', target: 'library-install-dialog', optional: true, title: 'ثبتِ نصب', body: 'پروژه را جستجو و انتخاب کنید.' },
      { id: 'note', target: 'library-install-note', optional: true, title: 'کجای سایت', body: 'بنویسید دقیقاً کجا نصب شده، مثلاً «صفحهٔ قیمت‌ها، داخلِ فرمِ سفارش».' },
      { id: 'values', target: 'library-install-values', optional: true, title: 'مقدارهای این پروژه', body: 'هر مقداری که در این پروژه با پیش‌فرض فرق دارد. نفرِ بعدی دقیقاً همین را لازم دارد.' },
      { id: 'save', target: 'library-install-dialog', optional: true, title: 'ذخیره', body: 'با «ذخیره» نصب ثبت می‌شود و مورد در تبِ «کد و راهنما» ی همان پروژه هم می‌آید.' },
    ],
  },
  {
    id: 'comms-library-create',
    title: 'ثبتِ موردِ تازه در کتابخانه',
    description: 'کد، راهنما یا یادداشتی بنویسید، با تصویر و اسکرین‌شاتِ هر گام.',
    audience: usesLibrary,
    order: 78,
    next: ['comms-library-client-guide'],
    steps: [
      { id: 'nav', target: 'nav-library', kind: 'click', advanceOnPath: '/library', title: 'کتابخانهٔ کد', body: 'روی «کتابخانهٔ کد» بزنید.' },
      { id: 'new', target: 'library-new', kind: 'click', path: '/library', advanceOnPath: '/library/new', title: 'ثبتِ موردِ تازه', body: 'روی «ثبتِ موردِ تازه» بزنید.' },
      { id: 'kind', target: 'library-form-kind', path: '/library/new', title: 'این چیست؟', body: 'نوع را انتخاب کنید: کد، راهنمای کارفرما یا آموزش و یادداشت. نوع تعیین می‌کند کدام بخش‌ها مهم‌اند و چه کسی آن را می‌بیند.' },
      { id: 'title', target: 'library-form-title', path: '/library/new', title: 'مشخصات', body: 'عنوان، یک جملهٔ کوتاه دربارهٔ کارش، دسته، پلتفرم و وضعیت. برچسب‌ها را با Enter اضافه کنید تا بعداً پیدا شود.' },
      { id: 'steps', target: 'library-form-steps', path: '/library/new', title: 'گام‌ها', body: 'کار را قدم‌به‌قدم بنویسید. اسکرین‌شاتِ هر گام را روی همان گام بکشید و رها کنید یا Ctrl+V بزنید؛ هر گام می‌تواند تکه‌کد و گزینه‌های خودش را هم نشان دهد.' },
      { id: 'body', target: 'library-form-body', path: '/library/new', title: 'توضیحات و تصویر', body: 'تصویرِ کلی را اینجا بکشید و رها کنید یا Ctrl+V بزنید. پیوندِ ویدیو هم همین‌جا پخش می‌شود. یکی از تصویرها را می‌توانید «تصویرِ شاخص» ِ کارت کنید.' },
      { id: 'save', target: 'library-form-save', path: '/library/new', title: 'ثبت', body: 'با «ثبت در کتابخانه» مورد ذخیره می‌شود؛ «انصراف» چیزی ذخیره نمی‌کند. بعداً با «ویرایش» هم می‌توانید عوضش کنید.' },
    ],
  },
  {
    id: 'comms-library-client-guide',
    title: 'راهنمای کارفرما',
    description: 'راهنمایی بنویسید که کارفرما در صفحهٔ پروژه‌اش بخواند.',
    audience: usesLibrary,
    order: 79,
    steps: [
      { id: 'intro', title: 'راهنما برای کارفرما', body: 'راهنمای کارفرما به زبانِ ساده می‌گوید کارفرما چطور خودش چیزی را در سایت عوض کند، مثلاً قیمت‌ها را.' },
      { id: 'nav', target: 'nav-library', kind: 'click', advanceOnPath: '/library', title: 'کتابخانهٔ کد', body: 'روی «کتابخانهٔ کد» بزنید.' },
      { id: 'new', target: 'library-new', kind: 'click', path: '/library', advanceOnPath: '/library/new', title: 'ثبتِ موردِ تازه', body: 'روی «ثبتِ موردِ تازه» بزنید.' },
      { id: 'kind', target: 'library-form-kind', path: '/library/new', title: 'نوع: راهنمای کارفرما', body: 'گزینهٔ «راهنمای کارفرما» را بزنید تا کلیدِ «کارفرما ببیند» پیدا شود.' },
      { id: 'client', target: 'library-form-client', path: '/library/new', optional: true, title: 'کارفرما ببیند', body: 'این را روشن کنید تا کارفرمای هر پروژه‌ای که راهنما رویش نصب است، آن را در تبِ «راهنماها» ببیند. پیش‌نویس هرگز به کارفرما نشان داده نمی‌شود.' },
      { id: 'steps', target: 'library-form-steps', path: '/library/new', title: 'مراحل با اسکرین‌شات', body: 'کارفرما همین مراحل را می‌خواند؛ برای هر گام یک اسکرین‌شات بکشید و رها کنید یا Ctrl+V بزنید.' },
      { id: 'install', title: 'نصب روی پروژه', body: 'پس از ذخیره، در صفحهٔ راهنما با «پروژهٔ دیگر» آن را روی پروژهٔ کارفرما نصب کنید؛ از آن لحظه کارفرما می‌بیند.' },
    ],
  },
  {
    id: 'comms-client-guides',
    title: 'راهنماهای پروژهٔ من',
    description: 'آموزش‌هایی که تیم برای کارِ شما با سایت نوشته است.',
    audience: (c) => c.isClientOnly,
    order: 80,
    steps: [
      { id: 'nav', target: 'nav-projects', kind: 'click', advanceOnPath: '/projects', title: 'پروژه‌ها', body: 'روی «پروژه‌ها» بزنید.' },
      { id: 'card', target: 'projects-card', kind: 'click', path: '/projects', advanceOnPath: '/projects/', optional: true, title: 'پروژهٔ خودتان', body: 'روی پروژه‌تان بزنید.' },
      { id: 'tab', target: 'project-tab-library', kind: 'click', path: '/projects/', optional: true, title: 'راهنماها', body: 'روی تبِ «راهنماها» بزنید. اگر این تب نیست، هنوز راهنمایی برای پروژهٔ شما منتشر نشده است.' },
      { id: 'read', title: 'خواندنِ راهنما', body: 'هر راهنما گام‌به‌گام و با تصویر است؛ روی تصویرها بزنید تا بزرگ شوند. اگر جایی مبهم بود، در تبِ «کامنت‌ها» بپرسید.' },
    ],
  },
];
