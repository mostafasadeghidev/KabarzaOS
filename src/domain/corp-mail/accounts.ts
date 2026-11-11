/**
 * حساب‌های ایمیلِ شرکتی (۲.۶۰.۰) — منطقِ خالصِ جفت‌کردن و alias.
 *
 * ⚠️ در Stalwart فهرست‌ها (مثلِ `aliases`) map با کلیدِ رشته‌ایِ عددی‌اند، نه
 * آرایه، و `update` کلِ map را جایگزین می‌کند. پس همیشه کلِ فهرست ساخته و
 * فرستاده می‌شود و aliasهای دامنه‌های دیگر (مثلِ دامنهٔ قدیمی) دست‌نخورده می‌مانند.
 */

export interface StalwartAlias {
  enable: boolean;
  name: string;
  domainId: string;
  description: string | null;
}

export interface MailAccount {
  id: string;
  name: string;
  domainId: string;
  emailAddress: string;
  description: string;
  /** aliasهای دامنهٔ اصلی — فقط بخشِ پیش از @. */
  aliases: string[];
  /** aliasهای دامنه‌های دیگر — نمایش، نه ویرایش. */
  otherAliases: string[];
  usedBytes: number;
  quotaBytes: number | null;
}

type RawAccount = {
  id?: unknown; name?: unknown; domainId?: unknown; emailAddress?: unknown; description?: unknown;
  aliases?: unknown; usedDiskQuota?: unknown; quotas?: unknown;
};

export function aliasList(raw: unknown): StalwartAlias[] {
  if (!raw || typeof raw !== 'object') return [];
  return Object.keys(raw as Record<string, unknown>)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => (raw as Record<string, Partial<StalwartAlias>>)[k]!)
    .filter((a) => a && typeof a.name === 'string' && typeof a.domainId === 'string')
    .map((a) => ({ enable: a.enable !== false, name: a.name!, domainId: a.domainId!, description: a.description ?? null }));
}

/** پاسخِ `x:Account/get` ← شکلِ ما، با نامِ دامنه‌ها. */
export function toMailAccount(raw: RawAccount, domainId: string | null, domainNames: Map<string, string>): MailAccount | null {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const aliases = aliasList(raw.aliases);
  const quotas = (raw.quotas ?? {}) as { maxDiskQuota?: unknown };
  return {
    id: raw.id,
    name: raw.name,
    domainId: typeof raw.domainId === 'string' ? raw.domainId : '',
    emailAddress: typeof raw.emailAddress === 'string' ? raw.emailAddress : raw.name,
    description: typeof raw.description === 'string' ? raw.description : '',
    aliases: aliases.filter((a) => a.domainId === domainId && a.enable).map((a) => a.name),
    otherAliases: aliases
      .filter((a) => a.domainId !== domainId || !a.enable)
      .map((a) => `${a.name}@${domainNames.get(a.domainId) ?? a.domainId}${a.enable ? '' : ' (off)'}`),
    usedBytes: Number(raw.usedDiskQuota) || 0,
    quotaBytes: typeof quotas.maxDiskQuota === 'number' ? quotas.maxDiskQuota : null,
  };
}

/**
 * map ِ تازهٔ aliasها: aliasهای دامنه‌های دیگر (و خاموش‌ها) همان‌طور که بودند،
 * سپس فهرستِ خواستهٔ دامنهٔ اصلی. کلیدها از "0" پشتِ هم.
 */
export function buildAliasMap(current: StalwartAlias[], wanted: string[], domainId: string): Record<string, StalwartAlias> {
  const keep = current.filter((a) => a.domainId !== domainId);
  const fresh = [...new Set(wanted)].map((name) => {
    const prev = current.find((a) => a.domainId === domainId && a.name === name);
    return { enable: true, name, domainId, description: prev?.description ?? null };
  });
  return Object.fromEntries([...keep, ...fresh].map((a, i) => [String(i), a]));
}

/** همهٔ نام‌های گرفته‌شده در یک دامنه (نامِ حساب و aliasها)، جز حسابِ `exceptId`. */
export function takenNames(accounts: Array<{ id: string; name: string; domainId: string; aliases: string[] }>, domainId: string, exceptId?: string): Set<string> {
  const taken = new Set<string>();
  for (const a of accounts) {
    if (a.id === exceptId) continue;
    if (a.domainId === domainId) taken.add(a.name);
    for (const alias of a.aliases) taken.add(alias);
  }
  return taken;
}

/**
 * پیشنهادِ عضو برای یک حساب: ایمیلِ عضو با نشانی یا aliasها جور است، یا نامِ
 * کوچکِ لاتینِ عضو با نامِ حساب. فقط وقتی دقیقاً یک نفر جور است.
 */
export function suggestMember(
  account: Pick<MailAccount, 'name' | 'aliases' | 'emailAddress'>,
  domain: string,
  people: Array<{ id: number; name: string; email: string }>,
): number | null {
  const addresses = new Set([account.emailAddress.toLowerCase(), ...account.aliases.map((a) => `${a}@${domain}`)]);
  const byEmail = people.filter((p) => addresses.has(p.email.trim().toLowerCase()));
  if (byEmail.length === 1) return byEmail[0]!.id;
  const local = account.name.toLowerCase();
  const byName = people.filter((p) => {
    const first = p.name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const emailLocal = p.email.trim().toLowerCase().split('@')[0] ?? '';
    return first === local || emailLocal === local;
  });
  return byName.length === 1 ? byName[0]!.id : null;
}
