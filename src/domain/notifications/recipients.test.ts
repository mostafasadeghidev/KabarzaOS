import { describe, expect, it } from 'vitest';
import {
  commentAudience, newlyAssigned, reviewAudience, taskDoers,
} from './recipients';

describe('گیرندگانِ تسک', () => {
  it('مسئولِ مستقیم تنها گیرنده است', () => {
    expect(taskDoers({
      assignedTo: 7,
      roles: [{ roleTagId: 1, claimedBy: 9 }],
      members: [{ userId: 3, roleTagId: 1 }],
    })).toEqual([7]);
  });

  it('تسکِ نقشی: کسی که نقش را برداشته', () => {
    expect(taskDoers({
      assignedTo: null,
      roles: [{ roleTagId: 1, claimedBy: 9 }],
      members: [{ userId: 3, roleTagId: 1 }, { userId: 4, roleTagId: 1 }],
    })).toEqual([9]);
  });

  it('نقشِ برداشته‌نشده: همهٔ اعضای آن نقش', () => {
    expect(taskDoers({
      assignedTo: null,
      roles: [{ roleTagId: 1, claimedBy: null }],
      members: [{ userId: 3, roleTagId: 1 }, { userId: 4, roleTagId: 2 }, { userId: 5, roleTagId: 1 }],
    })).toEqual([3, 5]);
  });

  it('چند نقش، بدونِ تکرار', () => {
    expect(taskDoers({
      assignedTo: null,
      roles: [{ roleTagId: 1, claimedBy: null }, { roleTagId: 2, claimedBy: null }],
      members: [{ userId: 3, roleTagId: 1 }, { userId: 3, roleTagId: 2 }],
    })).toEqual([3]);
  });

  it('بدونِ مسئول و بدونِ نقش، کسی نیست', () => {
    expect(taskDoers({ assignedTo: null, roles: [], members: [] })).toEqual([]);
  });
});

describe('تغییرِ تخصیص', () => {
  it('فقط تازه‌واردها اعلان می‌گیرند', () => {
    expect(newlyAssigned({ after: [3, 4], before: [3], editorId: 9 })).toEqual([4]);
  });

  it('⚠️ خودِ ویرایش‌کننده اعلان نمی‌گیرد', () => {
    expect(newlyAssigned({ after: [9], before: [], editorId: 9 })).toEqual([]);
  });

  it('بدونِ تغییر، کسی اعلان نمی‌گیرد', () => {
    expect(newlyAssigned({ after: [3], before: [3], editorId: 9 })).toEqual([]);
  });
});

describe('مخاطبِ کامنت', () => {
  it('مدیران و اعضا و کارفرمایان، منهای نویسنده', () => {
    expect(commentAudience({
      managerIds: [1], officeManagerIds: [2], memberIds: [3, 4], clientIds: [5], authorId: 4,
    })).toEqual([1, 2, 3, 5]);
  });

  it('تکراری یک بار می‌آید', () => {
    // مدیرِ دفتری که خودش عضوِ پروژه هم هست.
    expect(commentAudience({
      managerIds: [1], officeManagerIds: [3], memberIds: [3], clientIds: [], authorId: 9,
    })).toEqual([1, 3]);
  });

  it('شناسهٔ نامعتبر کنار می‌رود', () => {
    expect(commentAudience({
      managerIds: [0, -1], officeManagerIds: [], memberIds: [3], clientIds: [], authorId: 9,
    })).toEqual([3]);
  });
});

describe('مخاطبِ ریویو', () => {
  it('⚠️ اعضای پروژه گیرنده نیستند — تصمیم‌گیرنده‌ها هستند', () => {
    expect(reviewAudience({
      managerIds: [1], officeManagerIds: [2], clientIds: [5],
    })).toEqual([1, 2, 5]);
  });

  it('خودِ عامل دو بار خبردار نمی‌شود', () => {
    expect(reviewAudience({
      managerIds: [1, 9], officeManagerIds: [], clientIds: [], actorId: 9,
    })).toEqual([1]);
  });
});
