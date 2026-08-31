import { describe, it, expect } from 'vitest';
import { assigneeOptions } from './assignees';

const members = [
  { userId: 1, name: 'آلیس', roleName: 'دولوپر' },
  { userId: 2, name: 'باب', roleName: null },
  { userId: 9, name: 'عضوِ سابق', roleName: 'طراح' },
];
const clients = [
  { userId: 5, name: 'شرکتِ آلفا' },
  { userId: 1, name: 'آلیس' }, // هم عضو، هم کارفرما
];

describe('R-PROJ-29 — فهرستِ «تخصیص به…»', () => {
  it('عضو با نقش برچسبِ «نام · نقش» می‌گیرد، بی‌نقش فقط نام', () => {
    const out = assigneeOptions(members, [], {});
    expect(out[0]).toEqual({ userId: 1, label: 'آلیس · دولوپر' });
    expect(out[1]).toEqual({ userId: 2, label: 'باب' });
  });

  it('کارفرما هم می‌تواند مسئولِ تسک باشد', () => {
    const out = assigneeOptions([], clients, {});
    expect(out.map((o) => o.label)).toContain('شرکتِ آلفا · کارفرما');
  });

  it('⚠️ کاربرِ هم‌عضو‌هم‌کارفرما یک بار می‌آید و برچسبِ عضو برنده است', () => {
    // وگرنه یک نفر دو بار در انتخابگر دیده می‌شد.
    const out = assigneeOptions(members, clients, {});
    expect(out.filter((o) => o.userId === 1)).toHaveLength(1);
    expect(out.find((o) => o.userId === 1)!.label).toBe('آلیس · دولوپر');
  });

  it('عضوِ غیرفعال به‌عنوانِ مسئولِ جدید پیشنهاد نمی‌شود', () => {
    const out = assigneeOptions(members, [], { inactiveUserIds: new Set([9]) });
    expect(out.map((o) => o.userId)).not.toContain(9);
  });

  it('⚠️ ولی اگر همین حالا مسئول باشد، در فهرست می‌ماند', () => {
    // بدونِ این، هر ویرایشِ ساده او را بی‌صدا از مسئولیت برمی‌داشت.
    const out = assigneeOptions(members, [], {
      inactiveUserIds: new Set([9]),
      currentAssignee: 9,
    });
    expect(out.map((o) => o.userId)).toContain(9);
  });

  it('کارفرمای غیرفعال هم همین قاعده را دارد', () => {
    const inactive = new Set([5]);
    expect(assigneeOptions([], clients, { inactiveUserIds: inactive }).map((o) => o.userId))
      .not.toContain(5);
    expect(assigneeOptions([], clients, { inactiveUserIds: inactive, currentAssignee: 5 })
      .map((o) => o.userId)).toContain(5);
  });
});
