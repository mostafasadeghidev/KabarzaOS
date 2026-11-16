import { describe, expect, it } from 'vitest';
import {
  cloudUserIdProblem, normalizeBaseUrl, normalizeConnectionInput, ocsEnvelope, parseCloudUser, parseCloudUsers,
  suggestCloudMember, suggestCloudUserId,
} from './nextcloud';

describe('normalizeBaseUrl', () => {
  it('keeps https origin and sub-path, drops trailing slash and index.php', () => {
    expect(normalizeBaseUrl('https://cloud.example.com/')).toBe('https://cloud.example.com');
    expect(normalizeBaseUrl(' https://example.com/nextcloud/index.php/ ')).toBe('https://example.com/nextcloud');
  });
  it('rejects plain http, credentials, query and garbage', () => {
    expect(normalizeBaseUrl('http://cloud.example.com')).toBeNull();
    expect(normalizeBaseUrl('https://u:p@cloud.example.com')).toBeNull();
    expect(normalizeBaseUrl('https://cloud.example.com/?x=1')).toBeNull();
    expect(normalizeBaseUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeBaseUrl('not a url')).toBeNull();
  });
  it('allows http only for localhost, and only when asked', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:18500')).toBeNull();
    expect(normalizeBaseUrl('http://127.0.0.1:18500', true)).toBe('http://127.0.0.1:18500');
    expect(normalizeBaseUrl('http://cloud.example.com', true)).toBeNull();
  });
});

describe('normalizeConnectionInput', () => {
  it('accepts a valid connection', () => {
    const { value, problems } = normalizeConnectionInput({
      name: ' Main ', baseUrl: 'https://cloud.example.com/', username: 'kabarza-os', groupId: 'team', defaultQuotaGb: '20', isActive: 'on',
    });
    expect(problems).toEqual([]);
    expect(value).toEqual({ name: 'Main', baseUrl: 'https://cloud.example.com', username: 'kabarza-os', groupId: 'team', defaultQuotaGb: 20, isActive: true });
  });
  it('lists every problem', () => {
    const { problems } = normalizeConnectionInput({ name: '', baseUrl: 'http://x', username: 'a/b', groupId: '', defaultQuotaGb: '0' });
    expect(problems).toEqual(['name', 'url', 'username', 'group', 'quota']);
  });
});

describe('cloudUserIdProblem', () => {
  it.each(['sara', 'sara.ahmadi', 'ali_2', 'a-b'])('accepts %s', (id) => expect(cloudUserIdProblem(id)).toBe(false));
  it.each(['a', 'Sara', '.sara', 'sara ahmadi', 'سارا', 'x'.repeat(33)])('rejects %s', (id) => expect(cloudUserIdProblem(id)).toBe(true));
});

describe('parseCloudUser', () => {
  it('reads usage, quota, last login and groups', () => {
    expect(parseCloudUser({
      id: 'sara', displayname: 'Sara A', email: 's@x', enabled: true, lastLogin: 1700000000000,
      quota: { used: 1024, quota: 10737418240 }, groups: ['team'],
    })).toEqual({
      id: 'sara', displayName: 'Sara A', email: 's@x', enabled: true, usedBytes: 1024, quotaBytes: 10737418240,
      lastLogin: 1700000000000, groups: ['team'],
    });
  });
  it('treats negative quota as unlimited and missing fields as empty', () => {
    const user = parseCloudUser({ id: 'ali', enabled: false, quota: { quota: -3 }, lastLogin: 0 });
    expect(user).toMatchObject({ id: 'ali', displayName: 'ali', enabled: false, usedBytes: 0, quotaBytes: null, lastLogin: null, groups: [] });
  });
  it('rejects rows without id', () => {
    expect(parseCloudUser({ displayname: 'x' })).toBeNull();
    expect(parseCloudUser(null)).toBeNull();
  });
  it('reads both object and array user lists', () => {
    expect(parseCloudUsers({ users: { a: { id: 'a' }, b: { id: 'b' } } }).map((u) => u.id)).toEqual(['a', 'b']);
    expect(parseCloudUsers({ users: [{ id: '1' }] }).map((u) => u.id)).toEqual(['1']);
    expect(parseCloudUsers(null)).toEqual([]);
  });
});

describe('ocsEnvelope', () => {
  it('accepts v1 and v2 success codes', () => {
    expect(ocsEnvelope({ ocs: { meta: { statuscode: 100 }, data: 1 } })).toMatchObject({ ok: true, data: 1 });
    expect(ocsEnvelope({ ocs: { meta: { statuscode: 200 }, data: [] } })).toMatchObject({ ok: true });
  });
  it('reports failures and non-OCS bodies', () => {
    expect(ocsEnvelope({ ocs: { meta: { statuscode: 102, message: 'User already exists' } } }))
      .toMatchObject({ ok: false, statuscode: 102, message: 'User already exists' });
    expect(ocsEnvelope({ hello: 1 })).toBeNull();
  });
});

describe('suggestions', () => {
  const people = [
    { id: 1, name: 'Sara Ahmadi', email: 'sara@x.com', username: null },
    { id: 2, name: 'Ali', email: 'ali.r@x.com', username: 'ali' },
    { id: 3, name: 'Ali', email: 'ali2@x.com', username: null },
  ];
  it('matches by username, email local part or display name — only when unique', () => {
    expect(suggestCloudMember({ id: 'sara', displayName: '', email: '' }, people)).toBe(1);
    expect(suggestCloudMember({ id: 'ali', displayName: '', email: '' }, people)).toBe(2);
    expect(suggestCloudMember({ id: 'zz', displayName: 'Sara Ahmadi', email: '' }, people)).toBe(1);
    // دو «Ali» ← حدسی نزن.
    expect(suggestCloudMember({ id: 'zz', displayName: 'ali', email: '' }, people)).toBeNull();
  });
  it('suggests a clean user id', () => {
    expect(suggestCloudUserId({ email: 'Sara.Ahmadi+x@x.com', username: null })).toBe('sara.ahmadix');
    expect(suggestCloudUserId({ email: 'x@x.com', username: 'Ali_R' })).toBe('ali_r');
  });
});
