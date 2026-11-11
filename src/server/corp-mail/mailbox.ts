import 'server-only';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, serviceGrants, services } from '@/db/schema';
import type { Actor } from '@/domain/access/permissions';
import { open as openSecret, seal } from '@/server/ai/secret-box';
import { isCorpMailConfigured, JmapError, jmapCall, result, sessionAccountId, type JmapAuth } from './jmap';
import { corpMailConfig } from './settings';

/**
 * صندوقِ ایمیلِ **خودِ** کارمند در برنامه (۲.۶۲.۰).
 *
 * برنامه برای هر کارمند یک app password ِ جدا با کمترین دسترسی می‌گیرد (خواندن و
 * علامتِ خوانده‌شده) و آن را رمزگذاری‌شده روی ردیفِ دفترِ همان کارمند نگه می‌دارد.
 * رمزِ اصلیِ کارمند فقط برای گرفتنِ همین کلید استفاده و دور ریخته می‌شود.
 *
 * ⚠️ همهٔ درخواست‌ها از سرور می‌روند؛ app password هرگز به مرورگر نمی‌رسد.
 * ⚠️ هر تابع فقط صندوقِ `actor.id` را می‌خواند — حتی مالک صندوقِ دیگری را نمی‌بیند،
 * و در «دیدن به‌جای کاربر» هیچ ایمیلی نشان داده نمی‌شود (حریمِ خصوصی).
 */

export type MailboxErrorCode =
  | 'not_configured' | 'no_mailbox' | 'not_connected' | 'bad_password' | 'too_many'
  | 'view_only' | 'not_found' | 'stalwart' | 'no_app_ips';

export class MailboxError extends Error {
  constructor(readonly code: MailboxErrorCode, readonly detail = '') {
    super(`mailbox: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'MailboxError';
  }
}

/**
 * کمترین دسترسی برای خواندن، پیوست و علامتِ خوانده‌شده — نام‌ها از schema ِ
 * Stalwart v1.1 (نشستِ Mail، ۲۰۲۶-۱۱-۱۱). `jmapEmailSet` در v1 نیست؛ `jmapEmailUpdate` است.
 */
const APP_PERMISSIONS = [
  'authenticate',
  'jmapMailboxGet', 'jmapMailboxChanges', 'jmapMailboxQuery',
  'jmapThreadGet', 'jmapThreadChanges',
  'jmapEmailGet', 'jmapEmailChanges', 'jmapEmailQuery', 'jmapEmailQueryChanges', 'jmapEmailUpdate',
  'jmapSearchSnippetGet', 'jmapBlobGet', 'jmapQuotaGet',
] as const;

const USING_MAIL = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'] as const;

function assertSelf(actor: Actor) {
  // ⚠️ دیدن به‌جای کاربر: مالک صندوقِ دیگری را نمی‌خواند.
  if (actor.viewOnly) throw new MailboxError('view_only');
}

/** ردیفِ بازِ ایمیلِ شرکتیِ خودِ کاربر، با نشانی و کلیدِ برنامه. */
async function ownGrant(userId: number) {
  const [row] = await db.select({
    id: serviceGrants.id, address: serviceGrants.accountRef, appSecretEnc: serviceGrants.appSecretEnc,
  })
    .from(serviceGrants)
    .innerJoin(services, eq(services.id, serviceGrants.serviceId))
    .where(and(
      eq(serviceGrants.userId, userId), isNull(serviceGrants.revokedAt),
      eq(services.provider, 'stalwart'), ne(serviceGrants.externalId, ''),
    ));
  return row ?? null;
}

/** صندوقِ وصل‌شده دارد؟ — برای منو و پروفایل، بی هیچ درخواستِ بیرونی. */
export async function mailboxState(userId: number): Promise<'none' | 'linked' | 'connected'> {
  if (!isCorpMailConfigured()) return 'none';
  const grant = await ownGrant(userId);
  if (!grant) return 'none';
  return grant.appSecretEnc ? 'connected' : 'linked';
}

/* ---- محدودیتِ تلاشِ رمز ---- */

/**
 * ⚠️ برنامه نباید ابزارِ حدس‌زدنِ رمزِ ایمیل شود: ۵ تلاشِ ناموفق در ۱۵ دقیقه برای
 * هر کاربر. روی globalThis تا نسخه‌های جدای ماژول یک شمارنده داشته باشند.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const fails: Map<number, number[]> = ((globalThis as { __kbzMailFails?: Map<number, number[]> }).__kbzMailFails ??= new Map());

function tooMany(userId: number, now = Date.now()): boolean {
  const recent = (fails.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(userId, recent);
  return recent.length >= MAX_FAILS;
}

/**
 * گرفتنِ app password با هویتِ خودِ کاربر. `password` فقط همین‌جا استفاده می‌شود و
 * هیچ‌جا نوشته یا لاگ نمی‌شود. بی‌گارد — فراخوان‌ها گارد دارند.
 */
export async function issueAppPassword(grantId: number, address: string, password: string): Promise<void> {
  const config = await corpMailConfig();
  /**
   * ⚠️ بسته‌پیش‌فرض (نشستِ Mail، ۲۰۲۶-۱۱-۱۱): app password ِ بی‌محدودیتِ IP از اینترنت
   * هم با IMAP و JMAP کار می‌کند. تا مالک شبکهٔ برنامه را تعیین نکرده، کلیدی ساخته نمی‌شود.
   */
  if (config.appIps.length === 0) throw new MailboxError('no_app_ips');
  const auth: JmapAuth = { kind: 'basic', user: address, password };
  const accountId = await sessionAccountId(auth, 'urn:stalwart:jmap');
  const responses = await jmapCall([['x:AppPassword/set', {
    accountId,
    create: {
      k: {
        description: 'KabarzaOS',
        permissions: { '@type': 'Replace', permissions: Object.fromEntries(APP_PERMISSIONS.map((p) => [p, true])) },
        allowedIps: Object.fromEntries(config.appIps.map((ip) => [ip, true])),
      },
    },
  }, 's']], { auth });
  const set = result<{ created?: Record<string, { secret?: string }>; notCreated?: Record<string, { type?: string; description?: string }> }>(responses, 's');
  const secret = set.created?.k?.secret;
  if (!secret) {
    const why = set.notCreated?.k;
    console.warn('[corp-mail] app password refused', why?.type ?? 'unknown', String(why?.description ?? '').slice(0, 200));
    throw new MailboxError('stalwart', why?.type ?? 'notCreated');
  }
  await db.update(serviceGrants).set({ appSecretEnc: seal(secret), updatedAt: new Date() }).where(eq(serviceGrants.id, grantId));
}

/**
 * «اتصالِ صندوق» از پروفایل: کارمند یک بار رمزِ فعلیِ ایمیلش را می‌دهد.
 * ⚠️ رمزِ اشتباه (۴۰۱) در شمارِ تلاش‌ها می‌رود؛ رمز هرگز ذخیره نمی‌شود.
 */
export async function connectMailbox(actor: Actor, password: string): Promise<void> {
  assertSelf(actor);
  if (!isCorpMailConfigured()) throw new MailboxError('not_configured');
  const grant = await ownGrant(actor.id);
  if (!grant) throw new MailboxError('no_mailbox');
  if (tooMany(actor.id)) throw new MailboxError('too_many');
  if (!password || password.length > 500) throw new MailboxError('bad_password');
  try {
    await issueAppPassword(grant.id, grant.address, password);
  } catch (error) {
    if (error instanceof JmapError && error.code === 'unauthorized') {
      fails.set(actor.id, [...(fails.get(actor.id) ?? []), Date.now()]);
      throw new MailboxError('bad_password');
    }
    if (error instanceof JmapError) throw new MailboxError('stalwart', error.code);
    throw error;
  }
  fails.delete(actor.id);
  await db.insert(auditLog).values({
    actorType: 'user', actorId: actor.id, action: 'corp_mail.connect', objectType: 'service_grant', objectId: grant.id,
    before: null, after: { account: grant.address },
  });
}

/** قطعِ اتصال: کلیدِ برنامه از دفتر پاک می‌شود (کارمند خودش). */
export async function disconnectMailbox(actor: Actor): Promise<void> {
  assertSelf(actor);
  const grant = await ownGrant(actor.id);
  if (!grant) return;
  await db.update(serviceGrants).set({ appSecretEnc: '', updatedAt: new Date() }).where(eq(serviceGrants.id, grant.id));
}

/* ---- خواندن ---- */

interface Client { auth: JmapAuth; accountId: string; grantId: number }

/** هویتِ خواندن برای خودِ کاربر — کلیدِ برنامه، نه رمزِ اصلی. */
async function client(actor: Actor): Promise<Client> {
  assertSelf(actor);
  if (!isCorpMailConfigured()) throw new MailboxError('not_configured');
  const grant = await ownGrant(actor.id);
  if (!grant) throw new MailboxError('no_mailbox');
  const secret = grant.appSecretEnc ? openSecret(grant.appSecretEnc) : null;
  if (!secret) throw new MailboxError('not_connected');
  const auth: JmapAuth = { kind: 'basic', user: grant.address, password: secret };
  try {
    return { auth, accountId: await sessionAccountId(auth, 'urn:ietf:params:jmap:mail'), grantId: grant.id };
  } catch (error) {
    // کلید باطل شد (رمزِ تازه، بستن): اتصال پاک می‌شود تا کارمند دوباره وصل کند.
    if (error instanceof JmapError && error.code === 'unauthorized') {
      await db.update(serviceGrants).set({ appSecretEnc: '', updatedAt: new Date() }).where(eq(serviceGrants.id, grant.id));
      throw new MailboxError('not_connected');
    }
    if (error instanceof JmapError) throw new MailboxError('stalwart', error.code);
    throw error;
  }
}

async function call(c: Client, calls: Parameters<typeof jmapCall>[0]) {
  try {
    return await jmapCall(calls, { auth: c.auth, using: USING_MAIL });
  } catch (error) {
    if (error instanceof JmapError) throw new MailboxError(error.code === 'method' ? 'not_found' : 'stalwart', error.code);
    throw error;
  }
}

export interface MailFolder { id: string; name: string; role: string | null; unread: number; total: number }
export interface Address { name: string; email: string }
export interface MailListItem {
  id: string; subject: string; from: Address[]; receivedAt: string; preview: string;
  unread: boolean; flagged: boolean; hasAttachment: boolean;
}

const addresses = (raw: unknown): Address[] =>
  (Array.isArray(raw) ? raw : []).slice(0, 20).map((a: { name?: unknown; email?: unknown }) => ({
    name: typeof a?.name === 'string' ? a.name : '',
    email: typeof a?.email === 'string' ? a.email : '',
  }));

/** ترتیبِ نمایشِ پوشه‌ها: صندوقِ ورودی اول، بعد بقیهٔ نقش‌دارها، بعد بی‌نقش‌ها به ترتیبِ نام. */
const ROLE_ORDER = ['inbox', 'sent', 'drafts', 'archive', 'junk', 'trash'];

const PAGE = 30;

/** پوشه‌ها و یک صفحه از ایمیل‌های یک پوشه (پیش‌فرض: صندوقِ ورودی). */
export async function listMail(actor: Actor, opts: { folderId?: string; position?: number } = {}) {
  const c = await client(actor);
  const r1 = await call(c, [['Mailbox/get', { accountId: c.accountId, ids: null, properties: ['name', 'role', 'unreadEmails', 'totalEmails'] }, 'm']]);
  const folders = (result<{ list?: Array<Record<string, unknown>> }>(r1, 'm').list ?? [])
    .map((m) => ({
      id: String(m.id), name: String(m.name ?? ''), role: typeof m.role === 'string' ? m.role : null,
      unread: Number(m.unreadEmails) || 0, total: Number(m.totalEmails) || 0,
    }))
    .sort((a, b) => {
      const ra = a.role ? ROLE_ORDER.indexOf(a.role) : -1;
      const rb = b.role ? ROLE_ORDER.indexOf(b.role) : -1;
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb) || a.name.localeCompare(b.name);
    });
  const folder = folders.find((f) => f.id === opts.folderId) ?? folders.find((f) => f.role === 'inbox') ?? folders[0];
  if (!folder) return { folders, folder: null, items: [] as MailListItem[], total: 0, position: 0 };

  const position = Math.max(0, Math.min(Number(opts.position) || 0, 100_000));
  const r2 = await call(c, [
    ['Email/query', {
      accountId: c.accountId, filter: { inMailbox: folder.id },
      sort: [{ property: 'receivedAt', isAscending: false }], position, limit: PAGE, calculateTotal: true,
    }, 'q'],
    ['Email/get', {
      accountId: c.accountId, '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
      properties: ['subject', 'from', 'receivedAt', 'preview', 'keywords', 'hasAttachment'],
    }, 'g'],
  ]);
  const q = result<{ total?: number }>(r2, 'q');
  const items = (result<{ list?: Array<Record<string, unknown>> }>(r2, 'g').list ?? []).map((e) => {
    const keywords = (e.keywords ?? {}) as Record<string, boolean>;
    return {
      id: String(e.id), subject: String(e.subject ?? ''), from: addresses(e.from),
      receivedAt: String(e.receivedAt ?? ''), preview: String(e.preview ?? ''),
      unread: !keywords.$seen, flagged: Boolean(keywords.$flagged), hasAttachment: Boolean(e.hasAttachment),
    };
  });
  return { folders, folder, items, total: Number(q.total) || items.length, position };
}

export interface MailAttachment { blobId: string; name: string; type: string; size: number }
export interface MailMessage {
  id: string; subject: string; from: Address[]; to: Address[]; cc: Address[]; receivedAt: string;
  html: string | null; text: string; attachments: MailAttachment[];
}

const MAX_BODY = 1_000_000;

/** یک ایمیل با متن و پیوست‌ها؛ خوانده‌شده هم علامت می‌خورد. */
export async function readMail(actor: Actor, emailId: string): Promise<MailMessage> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(emailId)) throw new MailboxError('not_found');
  const c = await client(actor);
  const responses = await call(c, [
    ['Email/get', {
      accountId: c.accountId, ids: [emailId],
      properties: ['subject', 'from', 'to', 'cc', 'receivedAt', 'htmlBody', 'textBody', 'bodyValues', 'attachments', 'keywords'],
      fetchHTMLBodyValues: true, fetchTextBodyValues: true, maxBodyValueBytes: MAX_BODY,
    }, 'g'],
  ]);
  const e = (result<{ list?: Array<Record<string, unknown>> }>(responses, 'g').list ?? [])[0];
  if (!e) throw new MailboxError('not_found');

  const values = (e.bodyValues ?? {}) as Record<string, { value?: string }>;
  const join = (parts: unknown) => (Array.isArray(parts) ? parts : [])
    .map((p: { partId?: string }) => (p?.partId ? values[p.partId]?.value ?? '' : ''))
    .join('\n');
  const htmlParts = Array.isArray(e.htmlBody) ? e.htmlBody as Array<{ type?: string }> : [];
  const hasHtml = htmlParts.some((p) => p?.type === 'text/html');

  const keywords = (e.keywords ?? {}) as Record<string, boolean>;
  if (!keywords.$seen) {
    // علامتِ خوانده‌شده — شکستش نباید خواندن را بشکند.
    await call(c, [['Email/set', { accountId: c.accountId, update: { [emailId]: { 'keywords/$seen': true } } }, 's']]).catch(() => undefined);
  }

  return {
    id: emailId, subject: String(e.subject ?? ''), from: addresses(e.from), to: addresses(e.to), cc: addresses(e.cc),
    receivedAt: String(e.receivedAt ?? ''),
    html: hasHtml ? join(e.htmlBody) : null,
    text: join(e.textBody),
    attachments: (Array.isArray(e.attachments) ? e.attachments : []).slice(0, 50).map((a: Record<string, unknown>) => ({
      blobId: String(a.blobId ?? ''), name: String(a.name ?? 'attachment'), type: String(a.type ?? 'application/octet-stream'),
      size: Number(a.size) || 0,
    })).filter((a) => a.blobId),
  };
}

/**
 * پیوستِ یک ایمیل — فقط اگر واقعاً پیوستِ همان ایمیلِ خودِ کاربر باشد.
 * ⚠️ blobId ِ دلخواه پذیرفته نمی‌شود: اول فهرستِ پیوست‌های ایمیل خوانده می‌شود.
 */
export async function mailAttachment(actor: Actor, emailId: string, blobId: string): Promise<{ body: ReadableStream<Uint8Array>; name: string; type: string }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(emailId) || !/^[A-Za-z0-9_-]{1,256}$/.test(blobId)) throw new MailboxError('not_found');
  const c = await client(actor);
  const responses = await call(c, [['Email/get', { accountId: c.accountId, ids: [emailId], properties: ['attachments'] }, 'g']]);
  const e = (result<{ list?: Array<{ attachments?: Array<Record<string, unknown>> }> }>(responses, 'g').list ?? [])[0];
  const att = (e?.attachments ?? []).find((a) => a.blobId === blobId);
  if (!att) throw new MailboxError('not_found');
  const name = String(att.name ?? 'attachment');
  const type = String(att.type ?? 'application/octet-stream');

  const base = (process.env.STALWART_URL ?? '').trim().replace(/\/+$/, '');
  const res = await fetch(`${base}/jmap/download/${encodeURIComponent(c.accountId)}/${encodeURIComponent(blobId)}/${encodeURIComponent(name)}?accept=${encodeURIComponent(type)}`, {
    headers: { authorization: `Basic ${Buffer.from(`${c.auth.kind === 'basic' ? `${c.auth.user}:${c.auth.password}` : ''}`).toString('base64')}` },
    signal: AbortSignal.timeout(60_000),
    cache: 'no-store',
  }).catch(() => null);
  if (!res?.ok || !res.body) throw new MailboxError('stalwart', String(res?.status ?? 'network'));
  return { body: res.body, name, type };
}

/** پیامِ فارسیِ هر خطا. */
export function mailboxMessage(code: MailboxErrorCode): string {
  switch (code) {
    case 'not_configured': return 'ایمیلِ شرکتی وصل نیست.';
    case 'no_mailbox': return 'صندوقِ ایمیلِ شرکتی‌ای به نامِ شما ثبت نشده است.';
    case 'not_connected': return 'صندوقتان به برنامه وصل نیست؛ یک بار رمزِ ایمیلتان را بدهید تا وصل شود.';
    case 'bad_password': return 'رمزِ ایمیل درست نیست.';
    case 'too_many': return 'تلاش‌های ناموفقِ زیادی شد؛ ۱۵ دقیقهٔ دیگر دوباره امتحان کنید.';
    case 'view_only': return 'در حالتِ «دیدن به‌جای کاربر» ایمیل‌های او نشان داده نمی‌شود.';
    case 'not_found': return 'این ایمیل پیدا نشد.';
    case 'stalwart': return 'سرورِ ایمیل پاسخ نداد؛ کمی بعد دوباره امتحان کنید.';
    case 'no_app_ips': return 'اتصالِ صندوق هنوز روشن نیست: مدیرِ کل باید اول «IP های مجاز برای خواندنِ صندوق» را در تنظیماتِ ایمیلِ شرکتی بگذارد.';
  }
}

