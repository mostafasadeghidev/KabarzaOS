/**
 * کانالِ تیم و گروهِ پروژه — قواعدِ خالص.
 *
 * دو نوع گفتگوی گروهی کنارِ گفتگوی دونفره (`direct`):
 *  · `channel` — کانالِ تیم: مدیر می‌سازد، مخاطبش همهٔ اعضا، یک نقش یا یک دفتر.
 *    پیامِ عادی **هیچ** اعلانی ندارد؛ فقط منشن.
 *  · `project` — گروهِ یک پروژه: اعضای همان پروژه. پیامِ عادی اعلانِ
 *    (جمع‌شده) در برنامه و تلگرام دارد؛ منشن ایمیل هم دارد.
 *
 * ⚠️ عضویت **زنده** حساب می‌شود، نه کپی: از عضویتِ پروژه، نقش و دفترِ هر نفر.
 * کسی که از پروژه برداشته شود یا از تیم برود، همان لحظه دسترسی ندارد و هیچ
 * فهرستِ جدایی نیست که از واقعیت عقب بماند.
 *
 * ⚠️ کارفرما هرگز عضوِ هیچ‌کدام نیست.
 */

export const THREAD_KINDS = ['direct', 'channel', 'project'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

export function isGroupKind(kind: string): kind is 'channel' | 'project' {
  return kind === 'channel' || kind === 'project';
}

/** مخاطبِ کانالِ تیم. */
export type ChannelAudience =
  | { type: 'all' }
  | { type: 'role'; tagId: number }
  | { type: 'office'; officeId: number };

export function normalizeAudience(raw: unknown): ChannelAudience | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const id = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
  if (a.type === 'all') return { type: 'all' };
  if (a.type === 'role' && id(a.tagId)) return { type: 'role', tagId: id(a.tagId)! };
  if (a.type === 'office' && id(a.officeId)) return { type: 'office', officeId: id(a.officeId)! };
  return null;
}

/** پیام‌های گروهِ پروژه ۹۰ روز می‌مانند — مستقل از تنظیمِ پاک‌سازیِ بقیهٔ پیام‌ها. */
export const PROJECT_GROUP_RETENTION_DAYS = 90;

/**
 * پاسخِ «اعلانِ جمع‌شده»: تا وقتی اعلانِ خوانده‌نشدهٔ همین گروه کمتر از این
 * مدت پیش رفته، پیامِ تازه اعلانِ دوم (و تلگرامِ دوم) نمی‌سازد. با خواندنِ
 * گروه یا گذشتنِ این مدت، پیامِ بعدی دوباره خبر می‌دهد.
 */
export const GROUP_NOTIFY_QUIET_MINUTES = 120;

export const CHANNEL_TITLE_MAX = 80;

export class ChannelError extends Error {
  constructor(readonly code: 'title_required' | 'audience_invalid' | 'archived' | 'not_member' | 'exists') {
    super(`channel: ${code}`);
    this.name = 'ChannelError';
  }
}

export const CHANNEL_MESSAGES: Record<ChannelError['code'], string> = {
  title_required: 'نامِ کانال را بنویسید.',
  audience_invalid: 'مخاطبِ کانال معتبر نیست.',
  archived: 'این پروژه بایگانی شده است؛ گروهش فقط‌خواندنی است.',
  not_member: 'شما عضوِ این گروه نیستید.',
  exists: 'این پروژه از قبل گروهِ گفتگو دارد.',
};

export function normalizeChannelTitle(raw: string): string {
  const title = raw.trim().replace(/\s+/g, ' ').slice(0, CHANNEL_TITLE_MAX);
  if (!title) throw new ChannelError('title_required');
  return title;
}

/* ------------------------------------------------------------------ *
 * عضویت
 * ------------------------------------------------------------------ */

/** هر نفر از دیدِ عضویتِ کانال. */
export interface TeamPerson {
  id: number;
  /** فقط عضوِ فعال (نه سابق، نه «فقط مالی»، نه حذف‌شده). */
  active: boolean;
  /** نقش‌های سامانه‌ای — کارفرما و مدیر از همین تشخیص داده می‌شوند. */
  roles: readonly string[];
  /** تگ‌های نقشِ عضو (طراح، دولوپر…). */
  roleTagIds: readonly number[];
  officeIds: readonly number[];
}

export function isChannelManager(roles: readonly string[]): boolean {
  return roles.includes('owner') || roles.includes('admin');
}

/** عضوِ تیم = هر نقشی جز کارفرما. */
function isTeam(p: TeamPerson): boolean {
  return p.roles.some((r) => r !== 'client');
}

/**
 * اعضای کانالِ تیم. ⚠️ مدیران (مالک و ادمین) همیشه عضوند — کانال را آن‌ها
 * می‌سازند و اداره می‌کنند.
 */
export function channelMemberIds(audience: ChannelAudience, people: readonly TeamPerson[]): number[] {
  return people.filter((p) => {
    if (!p.active || !isTeam(p)) return false;
    if (isChannelManager(p.roles)) return true;
    if (audience.type === 'all') return true;
    if (audience.type === 'role') return p.roleTagIds.includes(audience.tagId);
    return p.officeIds.includes(audience.officeId);
  }).map((p) => p.id);
}

/**
 * اعضای گروهِ پروژه: اعضای پروژه (به‌جز کسی که دسترسی‌اش به همین پروژه بسته
 * است)، مدیرانِ دفترِ پروژه، و مالک/ادمین.
 */
export function projectGroupMemberIds(input: {
  people: readonly TeamPerson[];
  projectMembers: ReadonlyArray<{ userId: number; accessBlocked: boolean }>;
  /** مدیرانِ دفترِ همین پروژه. */
  officeManagerIds: readonly number[];
}): number[] {
  const onProject = new Set(input.projectMembers.filter((m) => !m.accessBlocked).map((m) => m.userId));
  const offices = new Set(input.officeManagerIds);
  return input.people.filter((p) => p.active && isTeam(p)
    && (isChannelManager(p.roles) || onProject.has(p.id) || offices.has(p.id)))
    .map((p) => p.id);
}

/* ------------------------------------------------------------------ *
 * نوشتن
 * ------------------------------------------------------------------ */

/**
 * چه کسی می‌تواند در گروه بنویسد.
 * ⚠️ کانالِ «فقط اعلان» (`allowReply = false`) فقط از دستِ مدیران؛ گروهِ پروژهٔ
 * بایگانی‌شده برای هیچ‌کس — تاریخچه دیده می‌شود، پیامِ تازه نه.
 */
export function canPostInGroup(input: {
  kind: 'channel' | 'project';
  isMember: boolean;
  allowReply: boolean;
  isManager: boolean;
  projectArchived: boolean;
}): boolean {
  if (!input.isMember) return false;
  if (input.kind === 'project' && input.projectArchived) return false;
  if (!input.allowReply) return input.isManager;
  return true;
}

/** «@همه» فقط از مدیرانِ سامانه، و در گروهِ پروژه از مدیرِ همان پروژه هم. */
export function canMentionAll(input: { kind: 'channel' | 'project'; isManager: boolean; managesProject: boolean }): boolean {
  return input.isManager || (input.kind === 'project' && input.managesProject);
}

/* ------------------------------------------------------------------ *
 * منشن
 * ------------------------------------------------------------------ */

/**
 * منشن در متنِ پیام به شکلِ `<@12>` (و «همه»: `<@all>`) ذخیره می‌شود، نه با
 * نام: نام ممکن است عوض شود، و نامِ مدیر برای عضو ماسک می‌شود (R-MSG-03)؛
 * پس برچسب هنگامِ **نمایش** و برای هر بیننده جدا ساخته می‌شود.
 */
const TOKEN = /<@(\d+|all)>/g;

export type MessagePart = { kind: 'text'; text: string } | { kind: 'mention'; id: number | 'all' };

export function splitMentions(body: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    if (m.index! > last) parts.push({ kind: 'text', text: body.slice(last, m.index) });
    parts.push({ kind: 'mention', id: m[1] === 'all' ? 'all' : Number(m[1]) });
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push({ kind: 'text', text: body.slice(last) });
  return parts;
}

/**
 * منشن‌های مجاز را نگه می‌دارد و بقیه را به متنِ ساده برمی‌گرداند.
 * ⚠️ سرور به متنِ فرستاده‌شده اعتماد نمی‌کند: شناسه‌ای که عضوِ گروه نیست، یا
 * «همه» از کسی که اجازه‌اش را ندارد، منشن نمی‌شود — وگرنه با دست‌کاریِ فرم
 * می‌شد به هر کسی اعلان فرستاد.
 */
export function sanitizeMentions(body: string, rules: { memberIds: ReadonlySet<number>; allowAll: boolean }) {
  const ids = new Set<number>();
  let all = false;
  const text = body.replace(TOKEN, (token, id: string) => {
    if (id === 'all') {
      if (!rules.allowAll) return '@';
      all = true;
      return token;
    }
    const n = Number(id);
    if (!rules.memberIds.has(n)) return '@';
    ids.add(n);
    return token;
  });
  return { body: text, ids: [...ids], all };
}

/** متنِ ساده برای پیش‌نمایشِ صندوق، اعلان و تلگرام — `@نام` به‌جای توکن. */
export function mentionsToPlain(body: string, label: (id: number) => string, allLabel: string): string {
  return body.replace(TOKEN, (_t, id: string) => `@${id === 'all' ? allLabel : label(Number(id))}`);
}

/* ------------------------------------------------------------------ *
 * اعلان
 * ------------------------------------------------------------------ */

/**
 * چه کسی برای یک پیامِ گروهی چه اعلانی می‌گیرد.
 *  · `mention` — فوری، با تلگرام و ایمیل. بی‌صدا کردنِ گروه جلویش را نمی‌گیرد.
 *  · `group`   — فقط گروهِ پروژه: اعلانِ جمع‌شده در برنامه و تلگرام (بی‌ایمیل).
 *    کانالِ تیم برای پیامِ عادی هیچ اعلانی ندارد.
 * ⚠️ نویسنده هیچ‌کدام را نمی‌گیرد؛ کسی که منشن شده اعلانِ «گروه» ِ تکراری نمی‌گیرد.
 */
export function groupRecipients(input: {
  kind: 'channel' | 'project';
  memberIds: readonly number[];
  authorId: number;
  mutedIds: ReadonlySet<number>;
  mentionedIds: readonly number[];
  mentionAll: boolean;
}): { mention: number[]; group: number[] } {
  const members = input.memberIds.filter((id) => id !== input.authorId);
  const memberSet = new Set(members);
  const mention = input.mentionAll
    ? members
    : [...new Set(input.mentionedIds)].filter((id) => memberSet.has(id));
  const mentioned = new Set(mention);
  const group = input.kind === 'project'
    ? members.filter((id) => !mentioned.has(id) && !input.mutedIds.has(id))
    : [];
  return { mention, group };
}
