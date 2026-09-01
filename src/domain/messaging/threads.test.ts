import { describe, it, expect } from 'vitest';
import {
  canRead, canReply, cooldownRemaining, isRateLimited, planCompose,
  streamFingerprint, type ThreadState,
} from './threads';

const ctx = (over = {}) => ({
  senderId: 1, senderIsManager: false, managerIds: [10, 11], ownerIds: [10], ...over,
});

describe('R-MSG-N1 — ارسال به چند نفر، چند رشتهٔ دونفره می‌سازد', () => {
  it('⚠️ هر گیرنده رشتهٔ خودش را دارد، نه یک گروهِ مشترک', () => {
    // وگرنه گیرنده‌ها همدیگر و پاسخ‌های هم را می‌دیدند.
    // فرستنده خودش مالک است تا این تست فقط دربارهٔ «یک رشته به‌ازای هر
    // گیرنده» بماند و درگیرِ قاعدهٔ هم‌مالکی نشود.
    const plan = planCompose([2, 3, 4], ctx({ senderId: 10, senderIsManager: true }));
    expect(plan.threads).toHaveLength(3);
    expect(plan.threads[0]!.participantIds).toEqual([10, 2]);
    expect(plan.threads[1]!.participantIds).toEqual([10, 3]);
    expect(plan.isBroadcast).toBe(true);
  });

  it('یک گیرنده یعنی پخشِ همگانی نیست', () => {
    expect(planCompose([2], ctx({ senderIsManager: true })).isBroadcast).toBe(false);
  });

  it('⚠️ فرستنده از فهرستِ گیرندگان حذف می‌شود', () => {
    const plan = planCompose([1, 2], ctx({ senderIsManager: true }));
    expect(plan.threads).toHaveLength(1);
    expect(plan.threads[0]!.recipientId).toBe(2);
  });

  it('گیرندهٔ تکراری یک بار می‌آید', () => {
    const plan = planCompose([2, 2, 3], ctx({ senderIsManager: true }));
    expect(plan.threads.map((t) => t.recipientId)).toEqual([2, 3]);
  });

  it('بدونِ گیرندهٔ معتبر هیچ رشته‌ای ساخته نمی‌شود', () => {
    expect(planCompose([0, -1, 1], ctx()).threads).toEqual([]);
  });
});

describe('⚠️ R-MSG-N3 — پیامِ همکار هم‌مالکِ مدیریت است', () => {
  it('فرستندهٔ غیرِ مدیر: مدیران به رشته اضافه می‌شوند', () => {
    // تا مدیر گفتگو و پاسخ‌ها را ببیند.
    const plan = planCompose([2], ctx({ senderIsManager: false }));
    expect(plan.threads[0]!.participantIds).toEqual([1, 10, 11, 2]);
  });

  /**
   * ⚠️ «دست‌نخورده» حالا فقط برای **مالک** صادق است. همکارِ ادمین هم مدیر
   * شمرده می‌شد و از قاعدهٔ ۳ معاف بود، پس رشته‌اش دو نفره می‌ماند و مالک
   * نمی‌دیدش — قاعدهٔ ۴ همان را می‌بندد.
   */
  it('رشتهٔ خودِ مالک دست‌نخورده می‌ماند', () => {
    const plan = planCompose([2], ctx({ senderId: 10, senderIsManager: true }));
    expect(plan.threads[0]!.participantIds).toEqual([10, 2]);
  });

  it('مدیری که خودش گیرنده است دو بار نمی‌آید', () => {
    const plan = planCompose([10], ctx({ senderIsManager: false }));
    expect(plan.threads[0]!.participantIds).toEqual([1, 10, 11]);
  });
});

describe('R-MSG-N2 — اعلانِ یک‌طرفه', () => {
  const announcement: ThreadState = {
    id: 1, creatorId: 1, allowReply: false, participantIds: [1, 2],
  };
  const chat: ThreadState = { id: 2, creatorId: 1, allowReply: true, participantIds: [1, 2] };

  it('⚠️ در اعلان فقط فرستنده می‌نویسد', () => {
    expect(canReply(announcement, 1)).toBe(true);
    expect(canReply(announcement, 2)).toBe(false);
  });

  it('گیرندهٔ اعلان می‌خواند، هرچند نمی‌نویسد', () => {
    expect(canRead(announcement, 2)).toBe(true);
  });

  it('در گفتگوی عادی هر شرکت‌کننده می‌نویسد', () => {
    expect(canReply(chat, 2)).toBe(true);
  });

  it('⚠️ غیرِ شرکت‌کننده نه می‌خواند نه می‌نویسد', () => {
    // بدونِ این، دانستنِ شناسهٔ رشته برای نوشتن در آن کافی می‌شد.
    expect(canRead(chat, 99)).toBe(false);
    expect(canReply(chat, 99)).toBe(false);
    expect(canReply(announcement, 99)).toBe(false);
  });
});

describe('محدودیتِ ارسال', () => {
  const now = new Date('2026-08-27T12:00:30Z');

  it('اولین ارسال محدود نیست', () => {
    expect(isRateLimited(null, now)).toBe(false);
  });

  it('ارسالِ ۱۰ ثانیه پیش محدود است', () => {
    expect(isRateLimited(new Date('2026-08-27T12:00:20Z'), now)).toBe(true);
    expect(cooldownRemaining(new Date('2026-08-27T12:00:20Z'), now)).toBe(20);
  });

  it('پس از ۳۰ ثانیه آزاد است', () => {
    expect(isRateLimited(new Date('2026-08-27T12:00:00Z'), now)).toBe(false);
    expect(cooldownRemaining(new Date('2026-08-27T12:00:00Z'), now)).toBe(0);
  });
});

describe('اثرانگشتِ گفت‌وگو', () => {
  it('با پیامِ تازه عوض می‌شود', () => {
    const a = streamFingerprint({ maxMessageId: 5, readStates: [], viewerId: 1 });
    const b = streamFingerprint({ maxMessageId: 6, readStates: [], viewerId: 1 });
    expect(a).not.toBe(b);
  });

  it('⚠️ با خواندنِ طرفِ مقابل هم عوض می‌شود', () => {
    const before = streamFingerprint({
      maxMessageId: 5, viewerId: 1,
      readStates: [{ userId: 2, lastReadMessageId: 3 }],
    });
    const after = streamFingerprint({
      maxMessageId: 5, viewerId: 1,
      readStates: [{ userId: 2, lastReadMessageId: 5 }],
    });
    expect(before).not.toBe(after);
  });

  it('⚠️ با خواندنِ خودِ بیننده عوض نمی‌شود', () => {
    // وگرنه هر پول یک «تغییر» دروغین گزارش می‌کرد.
    const a = streamFingerprint({
      maxMessageId: 5, viewerId: 1,
      readStates: [{ userId: 1, lastReadMessageId: 2 }, { userId: 2, lastReadMessageId: 4 }],
    });
    const b = streamFingerprint({
      maxMessageId: 5, viewerId: 1,
      readStates: [{ userId: 1, lastReadMessageId: 5 }, { userId: 2, lastReadMessageId: 4 }],
    });
    expect(a).toBe(b);
  });

  it('کمینه ملاک است، نه بیشینه', () => {
    // در گفت‌وگوی چندنفره، تا آخرین نفر نخوانده «همه خواندند» نیست.
    expect(streamFingerprint({
      maxMessageId: 9, viewerId: 1,
      readStates: [{ userId: 2, lastReadMessageId: 9 }, { userId: 3, lastReadMessageId: 4 }],
    })).toBe('9:4');
  });

  it('رسیدِ خالی صفر حساب می‌شود', () => {
    expect(streamFingerprint({
      maxMessageId: 2, viewerId: 1,
      readStates: [{ userId: 2, lastReadMessageId: null }],
    })).toBe('2:0');
  });
});

/**
 * ⚠️ رخنهٔ سرپرستی: «مدیر» همکارِ ادمین را هم می‌گیرد، پس قاعدهٔ «اگر
 * فرستنده مدیر نباشد مدیران را اضافه کن» او را هم معاف می‌کرد — و رشته‌ای
 * که همکارِ ادمین به یک عضو می‌فرستاد دقیقاً دو نفر داشت.
 */
describe('هم‌مالکیِ مالک', () => {
  it('رشتهٔ همکارِ ادمین را مالک هم می‌بیند', () => {
    const plan = planCompose([2], ctx({ senderId: 11, senderIsManager: true }));
    expect(plan.threads[0]!.participantIds).toContain(10);
  });

  it('مالک در رشتهٔ خودش دو بار نمی‌آید', () => {
    const plan = planCompose([2], ctx({ senderId: 10, senderIsManager: true }));
    expect(plan.threads[0]!.participantIds).toEqual([10, 2]);
  });

  it('رشتهٔ عضوِ عادی هم مدیران را دارد هم مالک را', () => {
    const plan = planCompose([2], ctx({ senderId: 5, senderIsManager: false }));
    expect(plan.threads[0]!.participantIds).toEqual([5, 10, 11, 2]);
  });
});
