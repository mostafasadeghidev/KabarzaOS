/**
 * جزئیاتِ یک رویدادِ ممیزی — «چه چیزی، روی چه چیزی، چطور عوض شد».
 *
 * هر سرویس `before`/`after` ِ خودش را به شکلِ خودش می‌نویسد: گاهی کلِ ردیف،
 * گاهی فقط ورودیِ فرم، گاهی یک مقدارِ تنها (وضعیتِ تازه). این فایل همه را به
 * یک شکلِ قابلِ نمایش برمی‌گرداند و تصمیم‌هایش دامنه‌ای و تست‌پذیرند.
 */

/**
 * ⚠️ کلیدهای رازی که هرگز نباید از لاگ بیرون بیایند.
 *
 * تا ۱.۱۱۳.۰ «ویرایشِ فرد» و «حذفِ فرد» کلِ ردیفِ کاربر را در `before` می‌نوشتند
 * — هشِ رمز، رازِ ورودِ دومرحله‌ای، توکنِ بازنشانی و اطلاعاتِ بانکی هم با آن.
 * حالا در نوشتن حذف می‌شوند و مهاجرتِ `0037` ردیف‌های قدیمی را پاک کرد؛ نمایش
 * هم دوباره حذفشان می‌کند تا هیچ مسیری به آنها نرسد.
 */
export const SENSITIVE_KEYS = [
  'password', 'passwordHash', 'resetTokenHash', 'resetExpiresAt', 'twoFactorSecret',
  'telegramLinkToken', 'telegramChatId', 'bankAccount', 'bankCard', 'bankIban',
  'token', 'tokenHash', 'secret', 'keyHash',
] as const;

const SENSITIVE = new Set<string>(SENSITIVE_KEYS);

/** کلیدهای فنی که برای خواننده چیزی نمی‌گویند. */
const NOISE = new Set([
  'id', 'createdAt', 'updatedAt', 'deletedAt', 'lastActiveAt', 'lastSeenAt', 'lastMessageSentAt',
  'invitePending', 'palette', 'theme', 'scope', 'sortOrder', 'notifyEmail', 'notifyEmailMuted',
  'notifyEmailOff', 'telegramOff', 'sourceHash', 'confidence',
]);

/** راز را از هر عمقی برمی‌دارد — برای نوشتن در لاگ و برای نمایش. */
export function redactSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSnapshot);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE.has(key))
        .map(([key, v]) => [key, redactSnapshot(v)]),
    );
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * «روی چه چیزی؟»
 * ------------------------------------------------------------------ */

export type SubjectKind =
  | 'user' | 'project' | 'task' | 'bid' | 'ledger' | 'account' | 'unit' | 'payment_request'
  | 'recurring' | 'meeting' | 'timelog' | 'currency' | 'tag' | 'office' | 'vendor' | 'qa_item'
  | 'service' | 'service_grant' | 'onboarding_item' | 'company' | 'settings' | 'backup' | 'fiscal';

/** نامِ نوعِ «مورد» — کنارِ نامش در فهرست و سرِ دیالوگ. */
export const SUBJECT_LABELS: Record<SubjectKind, string> = {
  user: 'فرد',
  project: 'پروژه',
  task: 'تسک',
  bid: 'پیشنهادِ مناقصه',
  ledger: 'ردیفِ دفتر',
  account: 'حساب',
  unit: 'کارکرد',
  payment_request: 'درخواستِ پرداخت',
  recurring: 'هزینهٔ دوره‌ای',
  meeting: 'جلسه',
  timelog: 'ساعتِ کاری',
  currency: 'ارز',
  tag: 'تگ',
  office: 'دفتر',
  vendor: 'طرف‌حساب',
  qa_item: 'آیتمِ QA',
  service: 'سرویس',
  service_grant: 'دسترسیِ بیرونی',
  onboarding_item: 'آیتمِ آنبوردینگ',
  company: 'مشخصاتِ شرکت',
  settings: 'تنظیماتِ سامانه',
  backup: 'پشتیبان‌گیری',
  fiscal: 'دورهٔ مالی',
};

/**
 * نوعِ واقعیِ «مورد».
 *
 * ⚠️ `object_type` به‌تنهایی کافی نیست: کمکیِ ممیزیِ هر سرویس یک نوعِ ثابت
 * می‌نویسد، پس «ارجاعِ تسک» با `project` و شناسهٔ **تسک** ثبت شده و «ارزِ
 * جدید» با `settings`. بدونِ نگاه به کلیدِ رویداد، فهرست «پروژهٔ #۱۲» نشان
 * می‌داد در حالی که ۱۲ شناسهٔ یک تسک بود.
 */
export function subjectKind(action: string, objectType: string): SubjectKind | null {
  const family = action.split('.')[0]!;
  switch (objectType) {
    case 'user': return 'user';
    case 'project':
      if (action === 'task.refer' || action === 'task.claim') return 'task';
      if (action === 'bid.update' || action === 'bid.submit') return 'bid';
      return 'project';
    case 'ledger':
      if (family === 'account') return 'account';
      if (family === 'fiscal') return 'fiscal';
      return 'ledger';
    case 'payout':
    case 'unit_entry':
      if (family === 'unit') return 'unit';
      if (family === 'request') return 'payment_request';
      if (family === 'recurring') return 'recurring';
      return null;
    case 'settings':
      if (family === 'currency' || family === 'rate') return 'currency';
      if (family === 'tag') return 'tag';
      if (family === 'office') return 'office';
      if (family === 'vendor') return 'vendor';
      if (family === 'qa') return 'qa_item';
      return 'settings';
    case 'meeting': return 'meeting';
    case 'timelog': return 'timelog';
    case 'service': return 'service';
    case 'service_grant': return 'service_grant';
    case 'onboarding_item': return 'onboarding_item';
    case 'company': return 'company';
    case 'backup': return 'backup';
    default: return null;
  }
}

/** مورد‌هایی که «یکی» هستند و شناسه ندارند — نامشان همان نوعشان است. */
export function isSingleton(kind: SubjectKind): boolean {
  return kind === 'company' || kind === 'settings' || kind === 'backup' || kind === 'fiscal';
}

/** نامِ عکس‌گرفته در خودِ رویداد — برای موردی که بعداً حذف شده است. */
export function snapshotName(before: unknown, after: unknown): string | null {
  for (const side of [before, after]) {
    if (side && typeof side === 'object' && !Array.isArray(side)) {
      const s = side as Record<string, unknown>;
      for (const key of ['title', 'name', 'code']) {
        if (typeof s[key] === 'string' && s[key] !== '') return s[key] as string;
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * ارجاع‌ها — شناسه‌ها به نام
 * ------------------------------------------------------------------ */

export type RefKind = 'user' | 'project' | 'task' | 'tag' | 'office' | 'currency' | 'account' | 'service' | 'vendor';

/** فیلدی که شناسه (یا فهرستِ شناسه) نگه می‌دارد → نوعِ آن شناسه. */
export const REF_FIELDS: Record<string, RefKind> = {
  userId: 'user', userIds: 'user', assignedTo: 'user', createdBy: 'user', payerUserId: 'user',
  receiverUserId: 'user', ownerUserId: 'user', assigneeUserId: 'user', grantedBy: 'user',
  revokedBy: 'user', decidedBy: 'user', memberIds: 'user', clientIds: 'user', from: 'user',
  projectId: 'project', parentId: 'project',
  taskId: 'task', taskIds: 'task', dependsOn: 'task',
  statusTagId: 'tag', priorityTagId: 'tag', categoryTagId: 'tag', roleTagId: 'tag',
  roleTagIds: 'tag', tagIds: 'tag', tenderRoles: 'tag',
  officeId: 'office', officeIds: 'office', managedOfficeIds: 'office',
  currencyId: 'currency', settledCurrencyId: 'currency', fromCurrencyId: 'currency',
  toCurrencyId: 'currency', defaultCurrencyId: 'currency',
  accountId: 'account', serviceId: 'service', vendorId: 'vendor',
};

/**
 * ⚠️ `from` فقط در «انتقالِ تسک‌ها» شناسهٔ فرد است؛ در مرخصی تاریخ است.
 * پس نوعِ ارجاع به رویداد هم بسته است، نه فقط به نامِ فیلد.
 */
export function fieldRef(action: string, field: string): RefKind | null {
  if (field === 'from' && action !== 'task.handover') return null;
  return REF_FIELDS[field] ?? null;
}

/**
 * مقدارِ تنهای (غیرِشیء) بعضی رویدادها خودش شناسه است — وضعیتِ تازهٔ پروژه
 * یک شناسهٔ تگ است، کارفرمایانِ پروژه فهرستِ شناسهٔ فرد.
 */
const SCALAR_REFS: Record<string, RefKind> = {
  'project.status': 'tag',
  'task.status': 'tag',
  'clients.set': 'user',
  'tender.announce': 'tag',
};

/** مقدارِ تنها با چه نامی نشان داده شود. */
const SCALAR_FIELDS: Record<string, string> = {
  'project.status': 'statusTagId',
  'task.status': 'statusTagId',
  'clients.set': 'clientIds',
  'members.set': 'members',
  'tender.announce': 'tenderRoles',
  'person.state': 'memberState',
  'project.archive': 'isArchived',
  'qa.toggle': 'isDone',
  'comment.status': 'status',
  'bid.withdraw': 'status',
  'unit.paid': 'status',
  'request.paid': 'status',
  'request.approved': 'status',
  'request.rejected': 'status',
  'recurring.pay': 'nextDueDate',
};

export interface Ref { kind: RefKind; id: number }

/** کلیدِ نقشهٔ نام‌ها: `user:3`. */
export const refKey = (kind: RefKind, id: number) => `${kind}:${id}`;

function idsIn(value: unknown): number[] {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return [value];
  if (typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0) return [Number(value)];
  if (Array.isArray(value)) return value.flatMap(idsIn);
  return [];
}

/** همهٔ شناسه‌هایی که برای نمایشِ این رویداد باید نام شوند. */
export function collectRefs(action: string, before: unknown, after: unknown): Ref[] {
  const out = new Map<string, Ref>();
  const add = (kind: RefKind, ids: number[]) => {
    for (const id of ids) out.set(refKey(kind, id), { kind, id });
  };
  const walk = (value: unknown, depth: number) => {
    if (depth > 3 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    for (const [field, v] of Object.entries(value as Record<string, unknown>)) {
      const kind = fieldRef(action, field);
      if (kind) add(kind, idsIn(v));
      else walk(v, depth + 1);
    }
  };
  const scalarKind = SCALAR_REFS[action];
  for (const side of [before, after]) {
    if (scalarKind && (side === null || typeof side !== 'object' || Array.isArray(side))) {
      add(scalarKind, idsIn(side));
    } else {
      walk(side, 0);
    }
  }
  return [...out.values()];
}

/* ------------------------------------------------------------------ *
 * «چه چیزی عوض شد؟»
 * ------------------------------------------------------------------ */

/**
 * یک ردیفِ جدولِ تغییرات.
 * `before: undefined` یعنی «مقدارِ قبلی در رویداد ثبت نشده» — نه «خالی بود».
 */
export interface ChangeRow {
  field: string;
  before?: unknown;
  after?: unknown;
  /** نوعِ شناسه، اگر مقدار شناسه است. */
  ref: RefKind | null;
}

export type ChangeMode =
  /** هر دو طرف ثبت شده — فقط فیلدهای عوض‌شده. */
  | 'diff'
  /** فقط مقدارهای تازه ثبت شده (ساخت، یا ویرایشی که حالتِ قبل را نگه نداشته). */
  | 'values'
  /** فقط حالتِ پیش از رویداد (حذف). */
  | 'removed'
  /** جزئیاتی ثبت نشده. */
  | 'none';

export interface ChangeSet {
  mode: ChangeMode;
  rows: ChangeRow[];
  /** فیلدهایی که فرستاده شدند ولی تغییری نکردند. */
  unchanged: number;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

const isEmpty = (v: unknown) => v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0);

/** برابریِ ساختاری — `[2,1]` و `[1,2]` برای فهرستِ شناسه برابرند. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const norm = (x: unknown[]) => x.map((v) => JSON.stringify(v)).sort();
    const [x, y] = [norm(a), norm(b)];
    return x.every((v, i) => v === y[i]);
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameValue(a[k], b[k]));
  }
  // «5» و 5 — فرم‌ها گاهی رشته می‌فرستند و ردیف عدد دارد.
  if (typeof a === 'number' && typeof b === 'string') return String(a) === b;
  if (typeof a === 'string' && typeof b === 'number') return a === String(b);
  return a === b;
}

/**
 * تغییراتِ یک رویداد.
 *
 * ⚠️ در ویرایش `after` معمولاً **ورودیِ فرم** است و `before` کلِ ردیف؛ پس
 * فقط فیلدهای `after` مقایسه می‌شوند — وگرنه هر ستونِ ردیف که در فرم نبود
 * «حذف‌شده» به نظر می‌رسید.
 */
export function describeChanges(action: string, rawBefore: unknown, rawAfter: unknown): ChangeSet {
  const before = redactSnapshot(rawBefore);
  const after = redactSnapshot(rawAfter);
  const row = (field: string, b: unknown, a: unknown, hasBefore: boolean, hasAfter: boolean): ChangeRow => ({
    field,
    ...(hasBefore ? { before: b } : {}),
    ...(hasAfter ? { after: a } : {}),
    ref: fieldRef(action, field) ?? (SCALAR_FIELDS[action] === field ? SCALAR_REFS[action] ?? null : null),
  });
  const visible = (key: string) => !NOISE.has(key);

  // مقدارِ تنها (وضعیت، فهرستِ شناسه، بله/خیر).
  const scalar = (v: unknown) => v !== null && v !== undefined && !isPlainObject(v);
  if (scalar(before) || scalar(after)) {
    if (isPlainObject(before) || isPlainObject(after)) {
      // یک طرف شیء و طرفِ دیگر تنها — هر کدام جدا نشان داده می‌شود.
      return describeChanges(action, isPlainObject(before) ? before : null, isPlainObject(after) ? after : null);
    }
    const field = SCALAR_FIELDS[action] ?? 'value';
    if (sameValue(before, after)) return { mode: 'none', rows: [], unchanged: 1 };
    const hasBefore = before !== null && before !== undefined;
    const hasAfter = after !== null && after !== undefined;
    return {
      mode: hasBefore && hasAfter ? 'diff' : hasBefore ? 'removed' : 'values',
      rows: [row(field, before, after, hasBefore, hasAfter)],
      unchanged: 0,
    };
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    let unchanged = 0;
    const rows: ChangeRow[] = [];
    for (const [key, value] of Object.entries(after)) {
      if (!visible(key)) continue;
      if (key in before && sameValue(before[key], value)) {
        unchanged += 1;
        continue;
      }
      // «ثبت نشده ← خالی» چیزی نمی‌گوید؛ نه تغییری معلوم است نه مقداری.
      if (!(key in before) && isEmpty(value)) continue;
      rows.push(row(key, before[key], value, key in before, true));
    }
    return { mode: rows.length > 0 || unchanged > 0 ? 'diff' : 'none', rows, unchanged };
  }

  if (isPlainObject(after)) {
    const rows = Object.entries(after)
      .filter(([key, v]) => visible(key) && !isEmpty(v))
      .map(([key, v]) => row(key, undefined, v, false, true));
    return { mode: rows.length > 0 ? 'values' : 'none', rows, unchanged: 0 };
  }

  if (isPlainObject(before)) {
    const rows = Object.entries(before)
      .filter(([key, v]) => visible(key) && !isEmpty(v))
      .map(([key, v]) => row(key, v, undefined, true, false));
    return { mode: rows.length > 0 ? 'removed' : 'none', rows, unchanged: 0 };
  }

  return { mode: 'none', rows: [], unchanged: 0 };
}
