import 'server-only';
import type { getDashboard } from '@/server/dashboard';
import type { getDashboardInbox } from '@/server/dashboard-inbox';
import type { getAdminExtras, getClientExtras, getMemberExtras } from '@/server/dashboard-extras';
import type { getMemberDashboard } from '@/server/dashboard-member';

/**
 * دادهٔ نمایشیِ داشبورد (فقط محلی) — برای دیدنِ اینکه هر کارت با دادهٔ زیاد چه شکلی می‌شود.
 * با `?demo=1` روی /dashboard، فقط در حالتِ توسعه. هیچ چیزی در پایگاه‌داده نوشته نمی‌شود؛
 * داده‌های واقعی دست‌نخورده می‌مانند و ردیف‌های ساختگی به آن‌ها اضافه می‌شوند.
 * ⚠️ شناسه‌ها از ۹۰۰۰ به بالا‌اند تا با رکوردِ واقعی قاطی نشوند (پیوندهایشان به صفحهٔ خالی می‌رسد).
 */

type Dash = Awaited<ReturnType<typeof getDashboard>>;
type Inbox = Awaited<ReturnType<typeof getDashboardInbox>>;
type AdminX = Awaited<ReturnType<typeof getAdminExtras>>;

export const DEMO_ALLOWED = process.env.NODE_ENV !== 'production';

const NAMES = ['سارا احمدی', 'علی رضایی', 'مریم کریمی', 'رضا محمدی', 'نگار حسینی', 'امیر جعفری', 'لیلا موسوی', 'حمید صادقی', 'زهرا نوری', 'کاوه طاهری', 'پریسا قاسمی', 'بهرام یزدانی'];
const PROJECTS = ['بازطراحیِ سایتِ آلفا', 'اپِ فروشگاهیِ بتا', 'لندینگِ کمپینِ پاییز', 'پنلِ مدیریتِ گاما', 'سئوی فروشگاهِ دلتا', 'برندینگِ اپسیلون', 'سایتِ چندزبانهٔ زتا', 'داشبوردِ گزارشِ اتا'];
const TASKS = ['طراحیِ صفحهٔ اصلی', 'اتصالِ درگاهِ پرداخت', 'بهینه‌سازیِ تصاویر', 'نوشتنِ متنِ درباره‌ما', 'رفعِ باگِ فرمِ تماس', 'ریسپانسیوِ منو', 'مهاجرتِ محتوا', 'تستِ مرورگرها', 'آیکون‌های جدید', 'صفحهٔ ۴۰۴'];
const id = (i: number) => 9000 + i;
const name = (i: number) => NAMES[i % NAMES.length]!;
const proj = (i: number) => PROJECTS[i % PROJECTS.length]!;
const task = (i: number) => TASKS[i % TASKS.length]!;
const dayIso = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const ago = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function demoDash(d: Dash): Dash {
  const now = Date.now();
  return {
    ...d,
    today: {
      ...d.today,
      online: [...d.today.online, ...range(10).map((i) => ({ id: id(i), name: name(i), state: (i % 3 ? 'active' : 'idle') as 'active' | 'idle', seen: new Date(now - i * 60000) }))],
      timers: [...d.today.timers, ...range(6).map((i) => ({ userId: id(i), name: name(i), project: proj(i), minutes: 15 + i * 23 }))],
      away: [...d.today.away, ...range(3).map((i) => ({ userId: id(20 + i), name: name(9 + i) }))],
      meetings: [...d.today.meetings, ...range(4).map((i) => ({ id: id(i), title: ['جلسهٔ هفتگیِ تیم', 'دموی کارفرمای آلفا', 'برنامه‌ریزیِ اسپرینت', 'بازبینیِ طراحیِ بتا'].at(i)!, meetAt: new Date(now + (i + 1) * 30 * 3600000) }))],
      activity: [...d.today.activity, ...range(10).map((i) => ({
        id: id(i), label: ['ثبتِ ساعت', 'تغییرِ وضعیتِ تسک', 'افزودنِ کامنت', 'ساختنِ تسک'].at(i % 4)!, actorId: id(i), actorName: name(i),
        at: new Date(now - (i + 1) * 47 * 60000), subject: task(i), project: proj(i),
      }))],
    },
    risk: {
      ...d.risk,
      overdue: [...d.risk.overdue, ...range(3).map((i) => ({ id: id(i), title: proj(i), badge: `${i + 2} روز گذشته` }))],
      soon: [...d.risk.soon, ...range(3).map((i) => ({ id: id(10 + i), title: proj(3 + i), badge: `${i + 1} روز مانده` }))],
      reviewStuck: [...d.risk.reviewStuck, ...range(2).map((i) => ({ id: id(20 + i), title: proj(6 + i), badge: `${4 + i} تسک در بازبینی` }))],
      stalled: [...d.risk.stalled, ...range(3).map((i) => ({ id: id(30 + i), title: `${proj(i)} (فاز ۲)`, badge: 'راکد ۱۴ روز' }))],
      expenseDues: [...d.risk.expenseDues, ...range(5).map((i) => ({ id: id(i), title: ['هاستِ سرور', 'اشتراکِ فیگما', 'دامنه', 'ایمیلِ سازمانی', 'سرویسِ پشتیبان'].at(i)!, amount: `€ ${(12 + i * 9).toFixed(2)}`, due: dayIso(i - 2), overdue: i < 2 }))],
    },
  };
}

export function demoInbox(x: Inbox): Inbox {
  return {
    ...x,
    review: [...x.review, ...range(8).map((i) => ({ id: id(i), number: 40 + i, title: task(i), projectId: id(i), projectTitle: proj(i), assigneeName: name(i), since: ago(3 + i * 7) }))],
    unassigned: [...x.unassigned, ...range(6).map((i) => ({ id: id(20 + i), number: 60 + i, title: task(i + 3), projectId: id(i), projectTitle: proj(i + 2), dueDate: i % 2 ? dayIso(i) : null }))],
    tenders: [...x.tenders, ...range(3).map((i) => ({ projectId: id(40 + i), title: `مناقصهٔ ${proj(i + 4)}`, bids: i + 1 }))],
    comments: [...x.comments, ...range(5).map((i) => ({ rootId: id(i), projectId: id(i), projectTitle: proj(i), authorName: name(i + 2), excerpt: ['این بخش را می‌شود ساده‌تر کرد؟', 'فایلِ نهایی کجاست؟', 'رنگِ دکمه با برند نمی‌خواند', 'تاریخِ تحویل عوض شد؟', 'لطفاً نسخهٔ موبایل را هم ببینید'].at(i)!, createdAt: ago(i * 5 + 1) }))],
    requests: [...x.requests, ...range(5).map((i) => ({ id: id(i), userId: id(i), userName: name(i), projectId: id(i), projectTitle: proj(i), amount: String(150 + i * 75), currencyCode: 'EUR', createdAt: ago(i * 9 + 2) }))],
    units: [...x.units, ...range(4).map((i) => ({ id: id(i), userId: id(i + 3), userName: name(i + 3), projectId: id(i), projectTitle: proj(i + 1), amount: String(40 + i * 20), currencyCode: 'EUR', date: dayIso(-i - 1) }))],
    noLog: [...x.noLog, ...range(7).map((i) => ({ userId: id(50 + i), name: name(i + 4) }))],
    week: [...x.week, ...range(12).map((i) => ({
      date: dayIso((i % 9) - 2), kind: (i % 3 ? 'task' : 'project') as 'task' | 'project', id: id(60 + i), title: i % 3 ? task(i) : proj(i),
      projectId: id(i), projectTitle: i % 3 ? proj(i) : undefined, overdue: (i % 9) - 2 < 0,
    }))].sort((a, b) => a.date.localeCompare(b.date)),
    capacity: [...x.capacity, ...range(10).map((i) => ({ userId: id(70 + i), name: name(i), openTasks: 2 + ((i * 7) % 13), minutes: 300 + ((i * 431) % 2400) }))]
      .sort((a, b) => b.openTasks - a.openTasks),
    clientWaiting: [...x.clientWaiting, ...range(6).map((i) => ({ rootId: id(80 + i), projectId: id(i), projectTitle: proj(i), authorName: `کارفرمای ${proj(i).split(' ').pop()}`, excerpt: ['کی نسخهٔ اول آماده می‌شود؟', 'لوگو را کمی بزرگ‌تر کنید', 'فاکتورِ این ماه را بفرستید', 'دسترسیِ هاست را لازم داریم', 'متن‌ها را فرستادیم، دیدید؟', 'جلسهٔ هفتهٔ بعد ساعتِ چند؟'].at(i)!, createdAt: ago(i * 6 + 1) }))],
    money: x.money ?? { clientDue: '12450', memberDebt: '3820', profit: '6210', projectCount: 14 },
  };
}

export function demoAdminExtras(x: AdminX): AdminX {
  return {
    ...x,
    receivables: [...(x.receivables ?? []), ...range(8).map((i) => ({ id: id(i), name: `شرکتِ ${['آلفا', 'بتا', 'گاما', 'دلتا', 'اپسیلون', 'زتا', 'اتا', 'تتا'].at(i)!}`, isFormer: i === 7, lines: [{ code: 'EUR', due: String(800 + i * 450) }, ...(i % 3 === 0 ? [{ code: 'USD', due: String(300 + i * 100) }] : [])], projectCount: 1 + (i % 4) }))],
    payroll: [...(x.payroll ?? []), ...range(6).map((i) => ({ userId: id(i), name: name(i), month: dayIso(-30 * (i % 2)).slice(0, 7), salaryId: id(i), amount: String(900 + i * 120), currencyCode: 'EUR', overdue: i < 2 }))],
    loans: [...(x.loans ?? []), ...range(2).map((i) => ({ userId: id(90 + i), name: name(i + 5) }))],
    renewals: [...(x.renewals ?? []), ...range(6).map((i) => ({ id: id(i), title: ['هاستِ سرور', 'اشتراکِ فیگما', 'دامنهٔ kabarza', 'گوگل ورک‌اسپیس', 'آداب کریتیو', 'سرویسِ ایمیل'].at(i)!, amount: String(10 + i * 15), currencyCode: 'EUR', nextDueDate: dayIso(i * 4 - 3), vendorName: ['هتزنر', 'فیگما', 'نیم‌چیپ', 'گوگل', 'ادوبی', 'مِیل‌گان'].at(i)!, overdue: i === 0 }))],
    qaTicks: [...(x.qaTicks ?? []), ...range(7).map((i) => ({ id: id(i), title: ['منو در موبایل درست باز می‌شود', 'فرمِ تماس ایمیل می‌فرستد', 'لوگو در هدر واضح است', 'سرعتِ صفحه قابلِ قبول است', 'متن‌ها غلطِ تایپی ندارند', 'لینک‌های فوتر کار می‌کنند', 'فاوآیکون درست است'].at(i)!, projectId: id(i), projectTitle: proj(i), byName: `کارفرمای ${proj(i).split(' ').pop()}`, doneAt: ago(i * 11 + 2) }))],
    access: [...(x.access ?? []), ...range(5).map((i) => ({ userId: id(95 + i), name: name(i + 7), memberState: i % 2 ? 'former' : 'inactive', grants: 2 + i }))],
    backup: x.backup ?? { ok: true, running: false, at: ago(5), error: null, failsInRow: 0 },
  };
}

/* ─────────────── عضو و کارفرما ─────────────── */

type MemberDash = Awaited<ReturnType<typeof getMemberDashboard>>;
type MemberX = Awaited<ReturnType<typeof getMemberExtras>>;
type ClientX = Awaited<ReturnType<typeof getClientExtras>>;

export function demoMemberDash(d: MemberDash): MemberDash {
  const now = Date.now();
  return {
    ...d,
    member: d.member && {
      ...d.member,
      rows: [...d.member.rows, ...range(7).map((i) => ({
        id: id(i), title: proj(i), thumbnailFileId: null, deadline: dayIso(i * 5 - 4), regDate: dayIso(-60 - i),
        statusName: ['در حالِ انجام', 'طراحی', 'بازبینی'].at(i % 3)!, statusGroup: 'active', statusColor: null,
        myRoles: [['طراح'], ['برنامه‌نویس'], ['طراح', 'مدیرِ پروژه']].at(i % 3)!, myMinutes: 120 + i * 95, myOpenTasks: 1 + (i % 4), percent: (i * 17) % 100,
      }))],
    },
    client: d.client && {
      ...d.client,
      rows: [...d.client.rows, ...range(5).map((i) => ({
        id: id(10 + i), title: proj(i + 2), thumbnailFileId: null, regDate: dayIso(-90 - i), deadline: dayIso(i * 7 - 3),
        statusName: ['در حالِ انجام', 'طراحی', 'تحویل'].at(i % 3)!, statusGroup: 'active', statusColor: null,
        price: String(2000 + i * 500), currencyCode: 'EUR', paymentStatus: (['unpaid', 'partial', 'paid'] as const).at(i % 3)!,
        totalDue: 2000 + i * 500, paid: String(i * 400), remaining: 2000 + i * 100, taskCount: 6 + i * 3, percent: (i * 23) % 100, teamMinutes: 600 + i * 240,
      }))],
    },
    tenders: [...d.tenders, ...range(4).map((i) => ({ id: id(40 + i), title: `مناقصهٔ ${proj(i + 3)}`, roleNames: [['طراح'], ['برنامه‌نویس', 'سئو']].at(i % 2)!, myBids: i % 2 }))],
    meetings: [...d.meetings, ...range(5).map((i) => ({ id: id(i), title: ['جلسهٔ هفتگیِ تیم', 'دموی کارفرمای آلفا', 'برنامه‌ریزیِ اسپرینت', 'بازبینیِ طراحیِ بتا', 'جلسهٔ شروعِ گاما'].at(i)!, meetAt: new Date(now + (i + 1) * 26 * 3600000), location: '', projectTitle: i % 2 ? proj(i) : null }))],
  };
}

/** تسکِ ساختگی با همهٔ فیلدهای ردیفِ صندوق (openTasksForUser + InboxTask). */
function fakeTask(i: number, opts: { review?: boolean; mine?: boolean }) {
  const due = i % 4 === 3 ? null : dayIso(i - 2);
  return {
    id: id(300 + i), title: task(i), projectId: id(i % 4), projectTitle: proj(i % 4), number: 100 + i, projectCode: ['ALF', 'BET', 'LND', 'GAM'].at(i % 4)!,
    dueDate: due, statusName: opts.review ? 'در انتظارِ بررسی' : ['در حالِ انجام', 'برای انجام'].at(i % 2)!, statusColor: null,
    isReview: !!opts.review, statusGroup: 'active', isPrivate: false, assignedTo: opts.mine ? 1 : id(i), assigneeName: name(i), createdBy: id(i),
    priorityName: i % 3 === 0 ? 'فوری' : null, priorityColor: i % 3 === 0 ? '#e5484d' : null, prioritySort: i % 3 === 0 ? 0 : null,
    notesCount: i % 3, lastNote: i % 3 ? 'نسخهٔ اول را فرستادم' : null,
    roles: [], claimable: false, mine: !!opts.mine,
  };
}

/** تسک‌ها: ردیف‌های ساختگی به فهرستِ واقعی اضافه می‌شوند (کاربرِ بی‌تسک هم کارتِ پُر می‌بیند). */
export function demoMemberTasks<T extends { active: unknown[]; waiting: unknown[]; review: unknown[] }>(x: T): T {
  return {
    ...x,
    active: [...x.active, ...range(9).map((i) => fakeTask(i, { mine: true }))],
    waiting: [...x.waiting, ...range(3).map((i) => fakeTask(20 + i, { review: true, mine: true }))],
    review: [...x.review, ...range(6).map((i) => fakeTask(40 + i, { review: true }))],
  } as T;
}

export function demoComments<T extends { rootId: number }>(rows: T[]): T[] {
  return [...rows, ...range(6).map((i) => ({
    rootId: id(400 + i), projectId: id(i % 4), projectTitle: proj(i % 4), authorName: name(i + 3),
    excerpt: ['رنگِ دکمه را عوض کنیم؟', 'متنِ بنر نهایی شد', 'این صفحه روی موبایل به هم ریخته', 'لینکِ فیگما را بفرستید', 'تاریخ تحویل جلو افتاد', 'آیکون‌ها را ببینید'].at(i)!,
    createdAt: ago(i * 7 + 1),
  } as unknown as T))];
}

export function demoMemberExtras(x: MemberX): MemberX {
  return {
    ...x,
    mentions: [...(x.mentions ?? []), ...range(6).map((i) => ({ id: id(i), title: `${name(i)} شما را در #${['عمومی', 'طراحی', 'فنی'].at(i % 3)!} صدا زد`, body: ['این را ببین لطفاً', 'فایل را آپلود کردم', 'کی وقت داری؟', 'تأیید شد', 'نسخهٔ جدید آماده است', 'جلسه ساعتِ ۴'].at(i)!, url: '/messages', createdAt: ago(i * 3 + 1) }))],
    leave: x.leave && [...x.leave, ...range(5).map((i) => ({ ...(x.leave![0] ?? {}), id: id(500 + i), fromDate: dayIso(3 + i * 6), toDate: dayIso(4 + i * 6 + (i % 2)), note: ['سفر', 'کارِ شخصی', '', 'دندان‌پزشکی', 'مرخصیِ سالانه'].at(i)! } as NonNullable<MemberX['leave']>[number]))],
  };
}

export function demoClientExtras(x: ClientX): ClientX {
  return {
    ...x,
    qa: [...(x.qa ?? []), ...range(9).map((i) => ({ id: id(i), title: ['منو در موبایل درست باز می‌شود', 'فرمِ تماس ایمیل می‌فرستد', 'لوگو در هدر واضح است', 'سرعتِ صفحه قابلِ قبول است', 'متن‌ها غلطِ تایپی ندارند', 'لینک‌های فوتر کار می‌کنند', 'فاوآیکون درست است', 'صفحهٔ ۴۰۴ طراحی شده', 'سئوی پایه انجام شده'].at(i)!, description: i % 2 ? 'روی گوشی و دسکتاپ هر دو بررسی شود.' : '', projectId: id(i % 3), projectTitle: proj(i % 3) }))],
    updates: [...(x.updates ?? []), ...range(10).map((i) => ({ kind: (i % 3 ? 'task' : 'file') as 'task' | 'file', id: id(i), title: i % 3 ? task(i) : `فایلِ ${['لوگو', 'طرحِ صفحهٔ اصلی', 'راهنمای برند', 'گزارشِ سئو'].at(i % 4)!}`, projectId: id(i % 3), projectTitle: proj(i % 3), at: ago(i * 13 + 2) }))],
    statement: [...(x.statement ?? []), ...range(5).map((i) => ({ projectId: id(10 + i), title: proj(i + 2), currencyCode: 'EUR', totalDue: String(2000 + i * 500), paid: String(i * 400), remaining: String(2000 + i * 100), lastPayment: i ? { paidAt: dayIso(-i * 12), amount: String(400) } : null }))],
  };
}
