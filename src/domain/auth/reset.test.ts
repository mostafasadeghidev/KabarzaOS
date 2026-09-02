import { describe, expect, it } from 'vitest';
import {
  checkResetToken, hashResetToken, INVITE_TTL_MS, inviteMailLines, newResetToken, RESET_TTL_MS,
  resetExpiry, resetMailLines, roleLabelFor,
} from './reset';

const t = (key: string, params: Record<string, string | number> = {}) =>
  key.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));

describe('توکنِ بازنشانی — پورتِ get_password_reset_key', () => {
  it('توکنِ تازه تصادفی و بلند است و فقط هشش ذخیره می‌شود', () => {
    const a = newResetToken();
    const b = newResetToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
    expect(hashResetToken(a)).not.toBe(a);
    expect(hashResetToken(a)).toBe(hashResetToken(a));
  });

  it('دعوت ۳ روز، بازنشانیِ عادی ۱ روز (پورتِ password_reset_expiration)', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    expect(resetExpiry(now, true).getTime() - now.getTime()).toBe(INVITE_TTL_MS);
    expect(resetExpiry(now, false).getTime() - now.getTime()).toBe(RESET_TTL_MS);
    expect(INVITE_TTL_MS).toBe(3 * RESET_TTL_MS);
  });

  it('⚠️ توکنِ غلط «نامعتبر»، توکنِ گذشته «منقضی»، درست «ok»', () => {
    const token = newResetToken();
    const now = new Date('2026-09-01T00:00:00Z');
    const row = { resetTokenHash: hashResetToken(token), resetExpiresAt: resetExpiry(now, false) };
    expect(checkResetToken(row, token, now)).toBe('ok');
    expect(checkResetToken(row, newResetToken(), now)).toBe('invalid');
    expect(checkResetToken(row, '', now)).toBe('invalid');
    expect(checkResetToken(row, token, new Date(now.getTime() + RESET_TTL_MS + 1))).toBe('expired');
    expect(checkResetToken({ resetTokenHash: null, resetExpiresAt: null }, token, now)).toBe('invalid');
  });
});

describe('متنِ ایمیل‌ها — پورتِ send_invite', () => {
  it('کاربرِ تازه لینکِ تعیینِ رمز می‌گیرد؛ موجود فقط داشبورد', () => {
    const fresh = inviteMailLines({ isNew: true, roleLabel: roleLabelFor('member'), site: 'کبرزا', link: 'https://x/reset?token=1', dashboard: 'https://x/' }, t);
    expect(fresh.subject).toBe('دعوت به کبرزا');
    expect(fresh.body).toContain('عضوِ تیم');
    expect(fresh.body).toContain('https://x/reset?token=1');
    expect(fresh.body).toContain('۳ روز');

    const existing = inviteMailLines({ isNew: false, roleLabel: roleLabelFor('client'), site: 'کبرزا', link: null, dashboard: 'https://x/' }, t);
    expect(existing.body).toContain('کارفرما');
    expect(existing.body).not.toContain('reset?token');
    expect(existing.body).toContain('https://x/');
  });

  it('ایمیلِ بازنشانی لینک و هشدارِ «نادیده بگیرید» دارد', () => {
    const mail = resetMailLines({ site: 'کبرزا', link: 'https://x/reset?token=2' }, t);
    expect(mail.subject).toContain('کبرزا');
    expect(mail.body).toContain('https://x/reset?token=2');
    expect(mail.body).toContain('نادیده');
  });
});
