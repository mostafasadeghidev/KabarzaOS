import { describe, it, expect } from 'vitest';
import { canViewAs, createViewAsToken, readViewAsToken } from './view-as';
import { createSessionToken } from './session';

/** «دیدن به‌جای کاربر» (۲.۵۳.۰). */

const SECRET = 'x'.repeat(40);

describe('توکن', () => {
  it('رفت‌وبرگشت', async () => {
    const token = await createViewAsToken({ ownerId: 1, targetId: 7 }, SECRET);
    expect(await readViewAsToken(token, SECRET)).toEqual({ ownerId: 1, targetId: 7 });
  });
  it('رازِ دیگر، توکنِ خراب یا خالی → null', async () => {
    const token = await createViewAsToken({ ownerId: 1, targetId: 7 }, SECRET);
    expect(await readViewAsToken(token, 'y'.repeat(40))).toBeNull();
    expect(await readViewAsToken(`${token}x`, SECRET)).toBeNull();
    expect(await readViewAsToken(undefined, SECRET)).toBeNull();
  });
  it('⚠️ توکنِ نشستِ معمولی جای توکنِ «دیدن به‌جای» پذیرفته نمی‌شود', async () => {
    const session = await createSessionToken({ userId: 7 }, SECRET);
    expect(await readViewAsToken(session, SECRET)).toBeNull();
  });
});

describe('canViewAs', () => {
  const owner = { id: 1, roles: ['owner'] as const };
  it('مالک به‌جای عضو و کارفرما', () => {
    expect(canViewAs(owner, { id: 2, roles: ['member'] })).toBe(true);
    expect(canViewAs(owner, { id: 3, roles: ['client'] })).toBe(true);
  });
  it('نه خودش، نه مالکِ دیگر، نه غیرمالک', () => {
    expect(canViewAs(owner, { id: 1, roles: ['owner'] })).toBe(false);
    expect(canViewAs(owner, { id: 4, roles: ['owner', 'member'] })).toBe(false);
    expect(canViewAs({ id: 5, roles: ['member'] }, { id: 2, roles: ['member'] })).toBe(false);
  });
});
