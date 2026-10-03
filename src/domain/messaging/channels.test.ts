import { describe, it, expect } from 'vitest';
import {
  canMentionAll, canPostInGroup, channelMemberIds, ChannelError, groupRecipients, mentionsToPlain,
  normalizeAudience, normalizeChannelTitle, projectGroupMemberIds, sanitizeMentions, splitMentions,
  type TeamPerson,
} from './channels';

const person = (id: number, over: Partial<TeamPerson> = {}): TeamPerson => ({
  id, active: true, roles: ['member'], roleTagIds: [], officeIds: [], ...over,
});

const people: TeamPerson[] = [
  person(1, { roles: ['owner'] }),
  person(2, { roleTagIds: [10], officeIds: [100] }),
  person(3, { roleTagIds: [11], officeIds: [200] }),
  person(4, { roles: ['client'] }),
  person(5, { active: false, roleTagIds: [10] }),
  person(6, { roles: ['member', 'client'], roleTagIds: [10] }),
];

describe('عضویتِ کانالِ تیم', () => {
  it('همه: اعضای فعال و مدیر — کارفرما و عضوِ سابق نه', () => {
    expect(channelMemberIds({ type: 'all' }, people)).toEqual([1, 2, 3, 6]);
  });
  it('نقش و دفتر — مدیر همیشه هست', () => {
    expect(channelMemberIds({ type: 'role', tagId: 10 }, people)).toEqual([1, 2, 6]);
    expect(channelMemberIds({ type: 'office', officeId: 200 }, people)).toEqual([1, 3]);
  });
});

describe('عضویتِ گروهِ پروژه', () => {
  it('اعضای پروژه + مدیرِ دفتر + مدیر؛ دسترسیِ بسته و کارفرما نه', () => {
    const ids = projectGroupMemberIds({
      people,
      projectMembers: [{ userId: 2, accessBlocked: false }, { userId: 3, accessBlocked: true }, { userId: 4, accessBlocked: false }],
      officeManagerIds: [6],
    });
    expect(ids).toEqual([1, 2, 6]);
  });
  it('⚠️ عضوِ سابقِ پروژه‌ای همان لحظه بیرون است', () => {
    expect(projectGroupMemberIds({
      people, projectMembers: [{ userId: 5, accessBlocked: false }], officeManagerIds: [],
    })).toEqual([1]);
  });
});

describe('نوشتن و «همه»', () => {
  const base = { kind: 'project' as const, isMember: true, allowReply: true, isManager: false, projectArchived: false };
  it('عضو می‌نویسد؛ غیرعضو نه؛ بایگانی‌شده برای هیچ‌کس', () => {
    expect(canPostInGroup(base)).toBe(true);
    expect(canPostInGroup({ ...base, isMember: false })).toBe(false);
    expect(canPostInGroup({ ...base, projectArchived: true, isManager: true })).toBe(false);
  });
  it('کانالِ «فقط اعلان» فقط از مدیر', () => {
    const ann = { ...base, kind: 'channel' as const, allowReply: false };
    expect(canPostInGroup(ann)).toBe(false);
    expect(canPostInGroup({ ...ann, isManager: true })).toBe(true);
  });
  it('@همه: مدیر همه‌جا، مدیرِ پروژه فقط در گروهِ پروژه', () => {
    expect(canMentionAll({ kind: 'channel', isManager: false, managesProject: true })).toBe(false);
    expect(canMentionAll({ kind: 'project', isManager: false, managesProject: true })).toBe(true);
    expect(canMentionAll({ kind: 'channel', isManager: true, managesProject: false })).toBe(true);
  });
});

describe('منشن', () => {
  it('تکه‌تکه برای نمایش', () => {
    expect(splitMentions('سلام <@2> و <@all>!')).toEqual([
      { kind: 'text', text: 'سلام ' }, { kind: 'mention', id: 2 }, { kind: 'text', text: ' و ' },
      { kind: 'mention', id: 'all' }, { kind: 'text', text: '!' },
    ]);
  });
  it('⚠️ غیرعضو و «همه» ِ بی‌اجازه منشن نمی‌شوند', () => {
    const r = sanitizeMentions('<@2> <@99> <@all>', { memberIds: new Set([2, 3]), allowAll: false });
    expect(r).toEqual({ body: '<@2> @ @', ids: [2], all: false });
    const ok = sanitizeMentions('<@all> <@3> <@3>', { memberIds: new Set([3]), allowAll: true });
    expect(ok).toEqual({ body: '<@all> <@3> <@3>', ids: [3], all: true });
  });
  it('متنِ ساده برای اعلان', () => {
    expect(mentionsToPlain('<@2> ببین <@all>', (id) => `کاربر${id}`, 'همه')).toBe('@کاربر2 ببین @همه');
  });
});

describe('گیرندگانِ اعلان', () => {
  const members = [1, 2, 3, 4];
  it('کانالِ تیم: پیامِ عادی بی‌اعلان، فقط منشن', () => {
    expect(groupRecipients({ kind: 'channel', memberIds: members, authorId: 1, mutedIds: new Set(), mentionedIds: [3], mentionAll: false }))
      .toEqual({ mention: [3], group: [] });
  });
  it('گروهِ پروژه: بقیه اعلانِ گروه؛ منشن‌شده فقط منشن؛ بی‌صدا فقط اگر منشن شود', () => {
    expect(groupRecipients({ kind: 'project', memberIds: members, authorId: 1, mutedIds: new Set([4]), mentionedIds: [3], mentionAll: false }))
      .toEqual({ mention: [3], group: [2] });
    expect(groupRecipients({ kind: 'project', memberIds: members, authorId: 1, mutedIds: new Set([4]), mentionedIds: [4], mentionAll: false }))
      .toEqual({ mention: [4], group: [2, 3] });
  });
  it('@همه به همه جز نویسنده؛ منشنِ غیرعضو و خودِ نویسنده نادیده', () => {
    expect(groupRecipients({ kind: 'channel', memberIds: members, authorId: 2, mutedIds: new Set([3]), mentionedIds: [], mentionAll: true }))
      .toEqual({ mention: [1, 3, 4], group: [] });
    expect(groupRecipients({ kind: 'channel', memberIds: members, authorId: 2, mutedIds: new Set(), mentionedIds: [2, 99], mentionAll: false }))
      .toEqual({ mention: [], group: [] });
  });
});

describe('ورودی', () => {
  it('مخاطب و نام', () => {
    expect(normalizeAudience({ type: 'role', tagId: '10' })).toEqual({ type: 'role', tagId: 10 });
    expect(normalizeAudience({ type: 'office', officeId: 0 })).toBeNull();
    expect(normalizeAudience({ type: 'x' })).toBeNull();
    expect(normalizeChannelTitle('  طراحی   تیم ')).toBe('طراحی تیم');
    expect(() => normalizeChannelTitle('   ')).toThrow(ChannelError);
  });
});
