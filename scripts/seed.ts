/**
 * دادهٔ نمونه برای توسعه.
 * اجرای دوباره امن است — همه‌چیز را پاک و از نو می‌سازد.
 */
import { sql, db } from '../src/db/client';
import {
  currencies, users, userRoles, userPermissions, tags, projects, projectMembers,
  tasks, timelogs, comments, paymentRequests, unitEntries, meetings, meetingAttendees,
  reminders, absences, accounts,
  projectClients, tenderBids, attachments, qaItems, projectQa, projectPayments,
  offices, userOffices, tagRelations, threads, threadUsers, messages,
  ledger, exchangeRates, vendors, recurringExpenses, files, company,
} from '../src/db/schema';
import { hashPassword } from '../src/domain/auth/password';
import { eq } from 'drizzle-orm';

await sql`truncate table audit_log, messages, thread_users, threads,
  task_roles, tasks, timelogs, comments, unit_entries,
  payment_requests, meeting_attendees, meetings, reminders, absences, project_members, project_clients,
  tender_bids, project_qa, qa_items, attachments, project_payments, ledger,
  user_avatars, files,
  exchange_rates, recurring_expenses, vendors, projects, accounts,
  user_offices, offices, tag_relations, tags, user_permissions, user_roles, users, currencies restart identity cascade`;

/**
 * ⚠️ `truncate … cascade` روی `files` جدولِ تک‌ردیفیِ `company` را هم خالی
 * می‌کند (TRUNCATE CASCADE کلِ جدولِ ارجاع‌دهنده را می‌برد، فارغ از
 * ON DELETE). پس ردیفِ یکتا از نو ساخته می‌شود، وگرنه فاکتور بی‌صادرکننده
 * می‌ماند.
 */
await db.insert(company).values({
  id: 1,
  name: 'کبرزا',
  address: 'تهران، خیابانِ نمونه',
  taxId: '411222333',
  email: 'hi@kabarza.test',
  phone: '021-1234',
  website: 'kabarza.test',
  bank: 'بانکِ نمونه — IR12 0170 0000 0000',
  invoiceFooter: 'با تشکر از همکاری شما.',
}).onConflictDoNothing();

const curRows = await db.insert(currencies).values([
  { code: 'EUR', name: 'یورو', symbol: '€', decimals: 2, isDefault: true },
  { code: 'USD', name: 'دلار', symbol: '$', decimals: 2 },
]).returning({ id: currencies.id });
const [eur, usd] = curRows;

// نرخِ ارز — پایهٔ تبدیلِ ردیف‌های دفتر.
await db.insert(exchangeRates).values({
  fromCurrencyId: usd!.id, toCurrencyId: eur!.id, rate: '0.9', effectiveDate: '2026-01-01',
});

const password = await hashPassword('kabarza-dev-1234');
const people = await db.insert(users).values([
  { email: 'owner@kabarza.test', name: 'مالک', passwordHash: password },
  { email: 'staff@kabarza.test', name: 'همکارِ ادمین', passwordHash: password },
  { email: 'dev@kabarza.test', name: 'سارا (دولوپر)', passwordHash: password },
  { email: 'client@kabarza.test', name: 'شرکتِ آلفا', passwordHash: password },
  // عضوِ سابق — برای آزمودنِ زیرتبِ «اعضای سابق» و سه‌حالتیِ دسترسی (R-PEOPLE-01).
  { email: 'former@kabarza.test', name: 'رضا (عضوِ سابق)', passwordHash: password,
    phone: '0912-000-0000', memberState: 'finance' },
]).returning({ id: users.id });

const [owner, staff, dev, client, former] =
  people.map((p) => p.id) as [number, number, number, number, number];

await db.insert(userRoles).values([
  { userId: owner, role: 'owner' },
  { userId: staff, role: 'admin' },
  { userId: dev, role: 'member' },
  { userId: client, role: 'client' },
  { userId: former, role: 'member' },
]);

// دفاتر + عضویتِ افراد در آن‌ها.
const officeRows = await db.insert(offices).values([
  { name: 'دفتر تهران', location: 'تهران', defaultCurrencyId: eur!.id },
  { name: 'دفتر استانبول', location: 'استانبول', defaultCurrencyId: eur!.id },
]).returning({ id: offices.id });

await db.insert(userOffices).values([
  { userId: dev, officeId: officeRows[0]!.id },
  { userId: owner, officeId: officeRows[0]!.id, manages: true },
  { userId: owner, officeId: officeRows[1]!.id, manages: true },
  { userId: former, officeId: officeRows[1]!.id },
]);

// شمارهٔ تماس برای بقیه.
await db.update(users).set({ phone: '0912-111-1111' }).where(eq(users.id, dev));

// همکارِ ادمین: فقط مشاهدهٔ پروژه‌ها — برای آزمودنِ گاردها.
await db.insert(userPermissions).values([
  { userId: staff, permission: 'projects.view' },
  { userId: staff, permission: 'reports.view' },
]);

const statusTags = await db.insert(tags).values([
  { name: 'شروع نشده', type: 'project_status', statusGroup: 'not_started', sortOrder: 1 },
  { name: 'احتمال عقد قرارداد', type: 'project_status', statusGroup: 'lead', sortOrder: 2 },
  { name: 'در حال انجام', type: 'project_status', statusGroup: 'in_progress', sortOrder: 3 },
  { name: 'تکمیل‌شده', type: 'project_status', statusGroup: 'completed', sortOrder: 4 },
  // ⚠️ سه وضعیتِ زیر لازم‌اند، نه تزئینی: «متوقف» و «لغو شده» پایهٔ قاعدهٔ
  // «پروژهٔ منجمد»اند و بدونشان آن قاعده هیچ‌وقت فعال نمی‌شود.
  { name: 'در حال بررسی', type: 'project_status', statusGroup: 'in_progress', sortOrder: 5 },
  { name: 'متوقف', type: 'project_status', statusGroup: 'on_hold', sortOrder: 6 },
  { name: 'لغو شده', type: 'project_status', statusGroup: 'cancelled', sortOrder: 7 },
  { name: 'دولوپر', type: 'member_role' },
  { name: 'طراح', type: 'member_role' },
  { name: 'در حال انجام', type: 'task_status', statusGroup: 'in_progress' },
  { name: 'نیاز به ریویو', type: 'task_status', statusGroup: 'in_progress', isReview: true },
  { name: 'انجام شد', type: 'task_status', statusGroup: 'complete' },
  { name: 'فوری', type: 'task_priority', color: '#dc2626', sortOrder: 1 },
  { name: 'عادی', type: 'task_priority', color: '#64748b', sortOrder: 2 },
]).returning({ id: tags.id });

const [notStarted, lead, inProgress, done, devRole, designRole, taskInProgress, taskReview, taskDone,
  priorityUrgent] = statusTags.map((t) => t.id) as number[];

const regDate = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);

const created = await db.insert(projects).values([
  { title: 'طراحی وب‌سایت شرکت آلفا', price: '12500.5', currencyId: eur!.id, statusTagId: inProgress!, deadline: '2026-09-30', regDate },
  { title: 'کمپین تبلیغاتی بهار', price: '4200', currencyId: eur!.id, statusTagId: done! },
  { title: 'مذاکره با مشتری بتا', price: '8000', currencyId: eur!.id, statusTagId: lead! },
  { title: 'پروژهٔ داخلی', price: '0', currencyId: eur!.id, statusTagId: notStarted! },
  { title: 'خرید شخصی', price: '1500', currencyId: eur!.id, scope: 'private' },
  { title: 'نگهداریِ وب‌سایت آلفا', price: '2400', currencyId: eur!.id, statusTagId: notStarted!, regDate },
]).returning({ id: projects.id });

// زیرپروژه — برای پیوندهای «پیروِ:» و «زیرپروژه‌ها:» روی کارت (R-PROJ-20: یک سطح).
await db.update(projects).set({ parentId: created[0]!.id }).where(eq(projects.id, created[5]!.id));

// کارفرمای پروژه — چیپِ آبیِ کارت.
await db.insert(projectClients).values([
  { projectId: created[0]!.id, userId: client },
  { projectId: created[2]!.id, userId: client },
]);

await db.insert(projectMembers).values([
  { projectId: created[0]!.id, userId: dev, roleTagId: devRole!, agreedAmount: '3000' },
  { projectId: created[0]!.id, userId: dev, roleTagId: designRole!, agreedAmount: '1500' },
  { projectId: created[1]!.id, userId: dev, roleTagId: devRole!, agreedAmount: '900' },
]);

const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const lastWeekDate = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10);

// ددلاینِ گذشته + نزدیک، برای پر شدنِ بخشِ ریسک
await db.update(projects).set({ deadline: yesterday }).where(eq(projects.id, created[2]!.id));
await db.update(projects).set({ deadline: tomorrow }).where(eq(projects.id, created[0]!.id));
await db.update(projects).set({ isTender: true, regDate }).where(eq(projects.id, created[2]!.id));

// پیشنهادهای مناقصه — عددِ کنارِ نوارِ «مناقصه».
await db.insert(tenderBids).values([
  { projectId: created[2]!.id, userId: dev, roleTagId: devRole!, amount: '7200', currencyId: eur!.id },
]);

await db.insert(tasks).values([
  { projectId: created[0]!.id, title: 'پیاده‌سازی صفحهٔ اصلی', statusTagId: taskInProgress!, createdBy: owner },
  { projectId: created[0]!.id, title: 'طراحی لوگو', statusTagId: taskReview!, priorityTagId: priorityUrgent!, createdBy: owner },
  { projectId: created[0]!.id, title: 'راه‌اندازی دامنه', statusTagId: taskDone!, createdBy: owner },
  { projectId: created[2]!.id, title: 'تهیهٔ پیش‌فاکتور', statusTagId: taskInProgress!, createdBy: owner },
]);

// کامنتِ باز و حل‌شده
await db.insert(comments).values([
  { projectId: created[0]!.id, userId: dev, body: 'رنگِ هدر را بررسی کنید.', status: 'open' },
  { projectId: created[0]!.id, userId: owner, body: 'انجام شد.', status: 'done', closedBy: owner, closedAt: new Date() },
  { projectId: created[0]!.id, userId: dev, body: 'فونتِ فارسی را تأیید کنید.', status: 'needs_review' },
]);

// پیوست و لینکِ خارجی — تبِ فایل‌ها.
// لینکِ بیرونی فایلی لازم ندارد، پس همیشه ساخته می‌شود.
await db.insert(attachments).values({
  projectId: created[0]!.id,
  label: 'پوشهٔ گوگل‌درایو',
  externalUrl: 'https://drive.example.com/alpha',
  kind: 'link',
  userId: owner,
});

/**
 * پیوستِ واقعی — یک PNG ِ کوچک که واقعاً در S3 می‌نشیند.
 *
 * ⚠️ قیدِ `attachments_target_ck` نمی‌گذارد ردیفِ بی‌محتوا ساخته شود، پس بذر
 * هم باید فایلِ واقعی بسازد. اگر ذخیره‌سازی بالا نباشد، از این بخش می‌گذریم
 * تا بذرزدن برای کسی که MinIO ندارد نشکند.
 */
const DEMO_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

try {
  const { ensureBucket, putObject } = await import('../src/server/files/storage');
  await ensureBucket();

  const key = 'attachment/seed-demo-brief.png';
  await putObject(key, DEMO_PNG, 'image/png');

  const fileRows = await db.insert(files).values({
    storageKey: key,
    mime: 'image/png',
    size: DEMO_PNG.byteLength,
    originalName: 'طرحِ اولیه.png',
    purpose: 'attachment',
    uploadedBy: owner,
  }).returning({ id: files.id });

  await db.insert(attachments).values({
    projectId: created[0]!.id,
    label: 'طرحِ اولیه',
    fileId: fileRows[0]!.id,
    kind: 'image',
    userId: owner,
  });
} catch (error) {
  // ⚠️ دلیل چاپ می‌شود؛ catch ِ خاموش باعث شد همین شکست یک بار بی‌صدا رد شود.
  console.warn('⚠️  پیوستِ نمونه ساخته نشد — ذخیره‌سازی در دسترس نبود:', error);
  console.warn('    راه‌اندازی: docker compose up -d storage');
}

// چک‌لیستِ QA — یک آیتمِ تسک‌ساز و یک آیتمِ سادهٔ انجام‌شده (R-PROJ-18).
const qaLib = await db.insert(qaItems).values([
  { title: 'تست روی موبایل', roleTagId: designRole!, isTask: true, sortOrder: 1 },
  { title: 'بررسی سرعت بارگذاری', roleTagId: devRole!, isTask: false, sortOrder: 2 },
  // R-QA-02 — آیتمِ کارفرما نقشِ واقعی ندارد؛ با نقشِ خالی شناخته می‌شود.
  { title: 'تأییدِ نهاییِ طرح', roleTagId: null, isTask: true, sortOrder: 3 },
]).returning({ id: qaItems.id });

await db.insert(projectQa).values([
  { projectId: created[0]!.id, qaItemId: qaLib[0]!.id, roleTagId: designRole!, title: 'تست روی موبایل', isDone: false },
  { projectId: created[0]!.id, qaItemId: qaLib[1]!.id, roleTagId: devRole!, title: 'بررسی سرعت بارگذاری', isDone: true, doneBy: dev, doneAt: new Date() },
]);

// تراکنش‌های مالیِ پروژه — تبِ مالی.
await db.insert(projectPayments).values([
  { projectId: created[0]!.id, userId: client, direction: 'incoming', amount: '5000', currencyId: eur!.id, paidAt: new Date(), note: 'پیش‌پرداخت' },
  { projectId: created[0]!.id, userId: dev, direction: 'member_payout', amount: '1200', currencyId: eur!.id, paidAt: new Date(), note: 'قسط اول' },
]);

// تگِ نقشِ اعضا — چیپِ رنگیِ کارتِ عضو.
await db.insert(tagRelations).values([
  { tagId: devRole!, objectId: dev, objectType: 'user' },
  { tagId: designRole!, objectId: former, objectType: 'user' },
]);

// ساعتِ کاری — این هفته و هفتهٔ قبل، برای دلتای پیشرفت
const todayStr = new Date().toISOString().slice(0, 10);
// شش هفته ساعتِ کاری برای اعضای مختلف — تا نمودارها واقعی دیده شوند.
const dayAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const workers = [dev, owner, staff];
const logs: Array<typeof timelogs.$inferInsert> = [];
for (let d = 0; d < 42; d += 1) {
  // آخر هفته کمتر، وسطِ هفته بیشتر — الگوی طبیعی
  const weekday = new Date(Date.now() - d * 86400000).getUTCDay();
  if (weekday === 5) continue; // جمعه تعطیل
  for (const [i, worker] of workers.entries()) {
    const base = [240, 150, 90][i] ?? 120;
    const jitter = ((d * 7 + i * 13) % 5) * 20;
    logs.push({
      projectId: created[d % 2]!.id,
      userId: worker,
      logDate: dayAgo(d),
      minutes: base + jitter,
      description: 'کارِ روزانه',
    });
  }
}
await db.insert(timelogs).values(logs);

// درخواستِ پرداختِ در انتظار + کارکردِ پرداخت‌نشده
const accRows = await db.insert(accounts).values([
  { name: 'حسابِ اصلی', currencyId: eur!.id, openingBalance: '10000', sortOrder: 1 },
  { name: 'حسابِ دلاری', currencyId: usd!.id, openingBalance: '2000', sortOrder: 2 },
]).returning({ id: accounts.id });
const acc = accRows;

// دستهٔ دفتر + چند ردیفِ دفترکل.
const ledgerTags = await db.insert(tags).values([
  { name: 'درآمدِ پروژه', type: 'ledger_category', sortOrder: 1 },
  { name: 'هزینهٔ دفتر', type: 'ledger_category', sortOrder: 2 },
]).returning({ id: tags.id });

await db.insert(ledger).values([
  {
    accountId: accRows[0]!.id, entryDate: dayAgo(20), direction: 'in',
    description: 'پیش‌پرداختِ پروژهٔ آلفا', amount: '5000', currencyId: eur!.id,
    amountAccount: '5000', amountEur: '5000', projectId: created[0]!.id,
    payerUserId: client, createdBy: owner,
  },
  {
    accountId: accRows[0]!.id, entryDate: dayAgo(10), direction: 'out',
    description: 'اجارهٔ دفتر تهران', amount: '800', currencyId: eur!.id,
    amountAccount: '800', amountEur: '800', receiverLabel: 'موجرِ دفتر', createdBy: owner,
  },
  {
    accountId: accRows[1]!.id, entryDate: dayAgo(5), direction: 'in',
    description: 'درآمدِ دلاری', amount: '1000', currencyId: usd!.id,
    amountAccount: '1000', amountEur: '900', createdBy: owner,
  },
]);
await db.insert(paymentRequests).values({
  projectId: created[0]!.id, userId: dev, amount: '500', currencyId: eur!.id, status: 'pending',
});
await db.insert(unitEntries).values({
  projectId: created[1]!.id, userId: dev, entryDate: todayStr,
  quantity: '12', amount: '360', currencyId: eur!.id, status: 'unpaid',
});

// جلسه‌ها — یکی عمومی، یکی پروژه‌ای با دعوت‌شده.
const meetingRows = await db.insert(meetings).values([
  {
    title: 'جلسهٔ هفتگیِ تیم', meetAt: new Date(Date.now() + 86400000),
    meetingScope: 'general', location: 'meet.google.com/kabarza', createdBy: owner,
  },
  {
    title: 'بررسی پیشرفت پروژهٔ آلفا', meetAt: new Date(Date.now() + 3 * 86400000),
    meetingScope: 'project', projectId: created[0]!.id,
    location: 'دفتر تهران', description: 'مرور تسک‌های باز.', createdBy: owner,
  },
]).returning({ id: meetings.id });

await db.insert(meetingAttendees).values([
  { meetingId: meetingRows[0]!.id, userId: dev },
  { meetingId: meetingRows[1]!.id, userId: dev },
  { meetingId: meetingRows[1]!.id, userId: client },
]);

// یادآورهای شخصیِ مالک.
await db.insert(reminders).values([
  {
    userId: owner, remindAt: new Date(Date.now() + 2 * 86400000),
    body: 'تماس با کارفرمای بتا', leadMinutes: [0, 60],
  },
  {
    userId: owner, remindAt: new Date(Date.now() + 7 * 86400000),
    body: 'ارسالِ فاکتورِ ماهانه', leadMinutes: [1440],
  },
]);
await db.insert(absences).values({
  userId: staff, fromDate: todayStr, toDate: todayStr, note: 'مرخصیِ استحقاقی',
});

// پیام‌ها — یک گفتگوی دوطرفه و یک اعلانِ یک‌طرفه.
const threadRows = await db.insert(threads).values([
  { creatorId: owner, allowReply: true },
  { creatorId: owner, allowReply: false },
]).returning({ id: threads.id });

await db.insert(threadUsers).values([
  { threadId: threadRows[0]!.id, userId: owner },
  { threadId: threadRows[0]!.id, userId: dev },
  { threadId: threadRows[1]!.id, userId: owner },
  { threadId: threadRows[1]!.id, userId: dev },
]);

await db.insert(messages).values([
  { threadId: threadRows[0]!.id, fromUserId: owner, body: 'سلام، وضعیتِ صفحهٔ اصلی چطور است؟' },
  { threadId: threadRows[0]!.id, fromUserId: dev, body: 'تا فردا آماده می‌شود.' },
  { threadId: threadRows[1]!.id, fromUserId: owner, body: 'یادآوری: جلسهٔ هفتگی دوشنبه ساعت ۱۰.' },
]);

// هزینه‌های دوره‌ای — یکی معوق، یکی نزدیک، یکی یک‌بار.
const vendorRows = await db.insert(vendors).values([
  { name: 'شرکتِ میزبانی' },
  { name: 'موجرِ دفتر' },
]).returning({ id: vendors.id });

await db.insert(recurringExpenses).values([
  {
    title: 'اجارهٔ دفتر تهران', amount: '800', currencyId: eur!.id, accountId: accRows[0]!.id,
    vendorId: vendorRows[1]!.id, kind: 'recurring', intervalUnit: 'month', intervalCount: 1,
    startDate: dayAgo(35), nextDueDate: dayAgo(3),
  },
  {
    title: 'سرور و دامنه', amount: '45', currencyId: eur!.id, accountId: accRows[0]!.id,
    vendorId: vendorRows[0]!.id, kind: 'recurring', intervalUnit: 'year', intervalCount: 1,
    startDate: dayAgo(360), nextDueDate: dayAgo(-5),
  },
  {
    title: 'خریدِ مانیتور', amount: '350', currencyId: eur!.id, accountId: accRows[0]!.id,
    kind: 'once', intervalUnit: 'month', intervalCount: 1,
    startDate: dayAgo(-20), nextDueDate: dayAgo(-20),
  },
]);

console.log('داده‌های نمونه ساخته شد.');
console.log('  owner@kabarza.test  (مالک — همه‌چیز)');
console.log('  staff@kabarza.test  (همکار — فقط مشاهدهٔ پروژه‌ها)');
console.log('  dev@kabarza.test    (عضو)');
console.log('  رمزِ همه: kabarza-dev-1234');

await sql.end();
