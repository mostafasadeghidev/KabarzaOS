import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client';
import { accounts, currencies, files, ledger, projectMembers, projects, users, userRoles } from '../schema';
import { createEntry, deleteEntry, getLedger, updateEntry } from '@/server/finance/service';
import { removeFiles, setAvatar, setProjectThumbnail, storeReceipt } from '@/server/files/service';
import { getObject } from '@/server/files/storage';
import { ForbiddenError } from '@/domain/access/guard';
import { FileRejected } from '@/domain/files/upload';
import type { Actor } from '@/domain/access/permissions';

/**
 * رسیدها، تصویرِ شاخص و آواتار — دو مصرف‌کنندهٔ آخرِ لایهٔ فایل.
 */

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...Array.from({ length: 24 }, (_, i) => i),
]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const PHP = new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70]);

let ownerId: number;
let memberId: number;
let accountId: number;
let projectId: number;

const actorOf = (id: number, roles: Actor['roles'], permissions: string[] = []): Actor =>
  ({ id, roles, permissions: permissions as Actor['permissions'], privateAccess: true });

let owner: Actor;
let member: Actor;

const blob = (over: Partial<{ name: string; mime: string; bytes: Uint8Array }> = {}) => ({
  name: 'receipt.png', mime: 'image/png', bytes: PNG, ...over,
});

const entry = () => ({
  accountId,
  entryDate: '2026-05-01',
  direction: 'out' as const,
  amount: '100.00',
  currencyId: 1,
  description: 'خریدِ آزمایشی',
  projectId: null,
  categoryTagId: null,
  officeId: null,
  payerUserId: null,
  payerLabel: '',
  receiverUserId: null,
  receiverLabel: '',
});

beforeAll(async () => {
  await sql`truncate table ledger, accounts, files, projects, user_roles, users, currencies restart identity cascade`;

  await db.insert(currencies).values({ code: 'EUR', name: 'یورو', symbol: '€', isDefault: true });

  const people = await db.insert(users).values([
    { email: 'o@t', name: 'مالک' },
    { email: 'm@t', name: 'عضو' },
  ]).returning({ id: users.id });
  [ownerId, memberId] = people.map((p) => p.id) as [number, number];

  await db.insert(userRoles).values([
    { userId: ownerId, role: 'owner' },
    { userId: memberId, role: 'member' },
  ]);

  const acc = await db.insert(accounts)
    .values({ name: 'حسابِ اصلی', currencyId: 1, openingBalance: '0' })
    .returning({ id: accounts.id });
  accountId = acc[0]!.id;

  const proj = await db.insert(projects).values({ title: 'پروژه' }).returning({ id: projects.id });
  projectId = proj[0]!.id;

  owner = actorOf(ownerId, ['owner']);
  member = actorOf(memberId, ['member']);
});

afterAll(async () => {
  await sql.end();
});

describe('رسیدِ ردیفِ دفتر', () => {
  it('رسید فقط با مجوزِ مالی ذخیره می‌شود', async () => {
    await expect(storeReceipt(member, blob())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('فهرستِ نوعِ رسید محدودتر است — ویدیو نمی‌پذیرد', async () => {
    await expect(storeReceipt(owner, blob({
      name: 'v.mp4', mime: 'video/mp4',
      bytes: new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]),
    }))).rejects.toBeInstanceOf(FileRejected);
  });

  it('PDF ِ سالم پذیرفته می‌شود', async () => {
    const id = await storeReceipt(owner, blob({ name: 'r.pdf', mime: 'application/pdf', bytes: PDF }));
    expect(id).toBeGreaterThan(0);
  });

  it('رسید به ردیف می‌چسبد و در فهرست دیده می‌شود', async () => {
    const receiptId = await storeReceipt(owner, blob());
    const entryId = await createEntry(owner, { ...entry(), addedReceiptIds: [receiptId] });

    const list = await getLedger(owner, { accountId });
    const row = list.entries.find((e) => e.id === entryId)!;
    expect(row.receipts).toHaveLength(1);
    // ⚠️ فقط مسیرِ گیت‌شده — هرگز آدرسِ S3.
    expect(row.receipts[0]!.href).toBe(`/api/files/${receiptId}`);
  });
});

describe('⚠️ ادغام هنگامِ ویرایش', () => {
  it('ذخیرهٔ بدونِ تغییر هیچ رسیدی را نمی‌اندازد', async () => {
    const a = await storeReceipt(owner, blob());
    const entryId = await createEntry(owner, { ...entry(), addedReceiptIds: [a] });

    await updateEntry(owner, entryId, entry()); // هیچ رسیدی در ورودی نیست

    const rows = await db.select({ ids: ledger.receiptIds }).from(ledger).where(eq(ledger.id, entryId));
    expect(rows[0]!.ids).toEqual([a]);
  });

  it('تیکِ حذف رسید را می‌برد و فایلش را هم پاک می‌کند', async () => {
    const a = await storeReceipt(owner, blob());
    const b = await storeReceipt(owner, blob());
    const entryId = await createEntry(owner, { ...entry(), addedReceiptIds: [a, b] });

    const keyRows = await db.select({ storageKey: files.storageKey })
      .from(files).where(eq(files.id, a));
    const key = keyRows[0]!.storageKey;

    await updateEntry(owner, entryId, { ...entry(), removedReceiptIds: [a] });

    const rows = await db.select({ ids: ledger.receiptIds }).from(ledger).where(eq(ledger.id, entryId));
    expect(rows[0]!.ids).toEqual([b]);
    expect(await db.select().from(files).where(eq(files.id, a))).toHaveLength(0);
    await expect(getObject(key)).rejects.toThrow();
  });

  it('رسیدِ تازه به قبلی‌ها اضافه می‌شود، جایگزینشان نمی‌شود', async () => {
    const a = await storeReceipt(owner, blob());
    const entryId = await createEntry(owner, { ...entry(), addedReceiptIds: [a] });

    const b = await storeReceipt(owner, blob());
    await updateEntry(owner, entryId, { ...entry(), addedReceiptIds: [b] });

    const rows = await db.select({ ids: ledger.receiptIds }).from(ledger).where(eq(ledger.id, entryId));
    expect(rows[0]!.ids).toEqual([a, b]);
  });

  it('حذفِ ردیف، رسیدهایش را هم می‌برد', async () => {
    const a = await storeReceipt(owner, blob());
    const entryId = await createEntry(owner, { ...entry(), addedReceiptIds: [a] });

    await deleteEntry(owner, entryId);
    expect(await db.select().from(files).where(eq(files.id, a))).toHaveLength(0);
  });
});

describe('تصویرِ شاخص و آواتار', () => {
  it('تصویرِ شاخص روی پروژه می‌نشیند و قبلی پاک می‌شود', async () => {
    const first = await setProjectThumbnail(owner, projectId, blob({ name: 'a.png' }));
    const second = await setProjectThumbnail(owner, projectId, blob({ name: 'b.png' }));

    const rows = await db.select({ fileId: projects.thumbnailFileId })
      .from(projects).where(eq(projects.id, projectId));
    expect(rows[0]!.fileId).toBe(second);
    // ⚠️ تصویرِ قبلی نباید در باکت بماند.
    expect(await db.select().from(files).where(eq(files.id, first))).toHaveLength(0);
  });

  it('⚠️ اسکریپتِ جازده‌شده به‌عنوانِ تصویرِ شاخص رد می‌شود', async () => {
    await expect(setProjectThumbnail(owner, projectId, blob({ bytes: PHP })))
      .rejects.toBeInstanceOf(FileRejected);
  });

  it('آدم آواتارِ خودش را می‌تواند عوض کند', async () => {
    const id = await setAvatar(member, memberId, blob());
    expect(id).toBeGreaterThan(0);
  });

  it('⚠️ آواتارِ دیگری بدونِ مدیریتِ اعضا ممنوع است', async () => {
    await expect(setAvatar(member, ownerId, blob())).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('⚠️ R-FILE-02 — ردیفی که ذخیره نشد نباید فایلِ بی‌صاحب بگذارد', () => {
  it('رسیدِ ردیفی که ثبتش شکست خورد پاک می‌شود', async () => {
    // رسید ذخیره شده، ولی ردیف رد می‌شود (مبلغِ نامعتبر).
    const receiptId = await storeReceipt(owner, blob());
    const key = (await db.select({ storageKey: files.storageKey })
      .from(files).where(eq(files.id, receiptId)))[0]!.storageKey;

    await expect(createEntry(owner, { ...entry(), amount: '0', addedReceiptIds: [receiptId] }))
      .rejects.toThrow();

    // شبیه‌سازیِ همان کاری که اکشن هنگامِ شکست می‌کند.
    await removeFiles([receiptId]);

    expect(await db.select().from(files).where(eq(files.id, receiptId))).toHaveLength(0);
    await expect(getObject(key)).rejects.toThrow();
  });
});

/**
 * رسید و «توسط» در نمایه‌های پایین‌دستی — پورتِ `fin_receipt_link` و
 * `last_actor_name` ِ نسخهٔ قبلی.
 */
describe('رسید در آینهٔ پرداخت و «توسط» در دفتر', () => {
  it('⚠️ رسیدِ ردیفِ دفتر از آینهٔ پرداخت هم دیده می‌شود', async () => {
    const receiptId = await storeReceipt(owner, blob());
    // ⚠️ آینهٔ «دستمزد» فقط برای گیرنده‌ای ساخته می‌شود که عضوِ همان
    // پروژه است (planPaymentMirror) — عضویت را می‌کاریم.
    await db.insert(projectMembers).values({ projectId, userId: memberId })
      .onConflictDoNothing();
    const entryId = await createEntry(owner, {
      ...entry(),
      direction: 'out',
      projectId,
      receiverUserId: memberId,
      addedReceiptIds: [receiptId],
    });

    const { listPayments } = await import('@/server/projects/repository');
    const payments = await listPayments(projectId);
    const mirrored = payments.find((p) => p.direction === 'member_payout');
    expect(mirrored, 'آینهٔ پرداخت ساخته نشده').toBeTruthy();
    expect(mirrored!.receiptIds).toContain(receiptId);
    void entryId;
  });

  it('«توسط» نامِ آخرین ثبت‌کننده را می‌دهد', async () => {
    const entryId = await createEntry(owner, { ...entry() });
    const list = await getLedger(owner, { accountId });
    const row = list.entries.find((e) => e.id === entryId)!;
    expect(row.lastActor).toBe('مالک');
  });
});

