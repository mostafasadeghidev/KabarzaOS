import { describe, expect, it } from 'vitest';
import {
  collectRefs, describeChanges, redactSnapshot, refKey, sameValue, snapshotName, subjectKind,
} from '../details';

describe('جزئیاتِ رویداد', () => {
  it('⚠️ راز از هر عمقی حذف می‌شود', () => {
    const row = {
      name: 'سارا', passwordHash: 'x', twoFactorSecret: 'y', resetTokenHash: 'z',
      bankIban: 'IR..', nested: [{ token: 't', keep: 1 }],
    };
    expect(redactSnapshot(row)).toEqual({ name: 'سارا', nested: [{ keep: 1 }] });
    expect(redactSnapshot(5)).toBe(5);
    expect(redactSnapshot(null)).toBeNull();
  });

  it('نوعِ «مورد» از کلیدِ رویداد هم خوانده می‌شود، نه فقط object_type', () => {
    expect(subjectKind('person.update', 'user')).toBe('user');
    expect(subjectKind('project.update', 'project')).toBe('project');
    // شناسهٔ تسک با نوعِ project ثبت می‌شود.
    expect(subjectKind('task.refer', 'project')).toBe('task');
    expect(subjectKind('bid.submit', 'project')).toBe('bid');
    expect(subjectKind('currency.create', 'settings')).toBe('currency');
    expect(subjectKind('rate.delete', 'settings')).toBe('currency');
    expect(subjectKind('tag.update', 'settings')).toBe('tag');
    expect(subjectKind('settings.system', 'settings')).toBe('settings');
    expect(subjectKind('account.create', 'ledger')).toBe('account');
    expect(subjectKind('fiscal.close', 'ledger')).toBe('fiscal');
    expect(subjectKind('request.paid', 'payout')).toBe('payment_request');
    expect(subjectKind('unit.paid', 'payout')).toBe('unit');
    expect(subjectKind('recurring.pay', 'payout')).toBe('recurring');
    expect(subjectKind('something', 'strange')).toBeNull();
  });

  it('نامِ عکس‌گرفته برای موردِ حذف‌شده', () => {
    expect(snapshotName({ title: 'تسکِ رفته' }, null)).toBe('تسکِ رفته');
    expect(snapshotName(null, { name: 'دفتر' })).toBe('دفتر');
    expect(snapshotName(3, [1])).toBeNull();
  });

  it('⚠️ ویرایش: فقط فیلدهای فرم مقایسه می‌شوند و بدون‌تغییرها شمرده می‌شوند', () => {
    const before = { id: 2, name: 'سارا', email: 'a@x', phone: '', passwordHash: 'h', createdAt: 'x' };
    const after = { name: 'سارا رضایی', email: 'a@x', phone: '', tagIds: [3] };
    const set = describeChanges('person.update', before, after);
    expect(set.mode).toBe('diff');
    expect(set.unchanged).toBe(2);
    expect(set.rows).toEqual([
      { field: 'name', before: 'سارا', after: 'سارا رضایی', ref: null },
      // در ردیف نبود ← «ثبت نشده»، نه «خالی».
      { field: 'tagIds', after: [3], ref: 'tag' },
    ]);
  });

  it('ساخت فقط مقدارهای پُر را نشان می‌دهد؛ حذف حالتِ پیشین را', () => {
    const created = describeChanges('project.create', null, { title: 'سایت', description: '', officeId: 4 });
    expect(created.mode).toBe('values');
    expect(created.rows.map((r) => r.field)).toEqual(['title', 'officeId']);

    const removed = describeChanges('task.delete', { id: 9, title: 'تسک', projectId: 1 }, null);
    expect(removed.mode).toBe('removed');
    expect(removed.rows.map((r) => r.field)).toEqual(['title', 'projectId']);
  });

  it('مقدارِ تنها: وضعیتِ پروژه شناسهٔ تگ است', () => {
    const set = describeChanges('project.status', 5, 7);
    expect(set).toEqual({
      mode: 'diff', unchanged: 0,
      rows: [{ field: 'statusTagId', before: 5, after: 7, ref: 'tag' }],
    });
    expect(describeChanges('person.state', 'active', 'finance').rows[0]!.field).toBe('memberState');
    expect(describeChanges('qa.toggle', false, true).rows[0]).toMatchObject({ before: false, after: true });
  });

  it('رویدادِ بی‌جزئیات', () => {
    expect(describeChanges('tag.delete', null, null)).toEqual({ mode: 'none', rows: [], unchanged: 0 });
  });

  it('شناسه‌های داخلِ تغییرات برای نام‌گذاری جمع می‌شوند', () => {
    const refs = collectRefs('task.update', { assignedTo: 3 }, { assignedTo: 4, roleTagIds: [8, 9], title: 'x' });
    expect(refs.map((r) => refKey(r.kind, r.id)).sort()).toEqual(['tag:8', 'tag:9', 'user:3', 'user:4']);
    expect(collectRefs('clients.set', [1, 2], [2, 5]).map((r) => refKey(r.kind, r.id)).sort())
      .toEqual(['user:1', 'user:2', 'user:5']);
    // اعضای پروژه: آرایه‌ای از شیء.
    expect(collectRefs('members.set', [{ userId: 3, roleTagId: 6 }], null).map((r) => refKey(r.kind, r.id)).sort())
      .toEqual(['tag:6', 'user:3']);
  });

  it('⚠️ «from» فقط در انتقالِ تسک شناسهٔ فرد است؛ در مرخصی تاریخ', () => {
    expect(collectRefs('task.handover', { from: 4 }, null)).toEqual([{ kind: 'user', id: 4 }]);
    expect(collectRefs('absence.set', null, { from: '2026-10-01' })).toEqual([]);
  });

  it('برابری: ترتیبِ فهرست و رشته/عدد مهم نیست', () => {
    expect(sameValue([1, 2], [2, 1])).toBe(true);
    expect(sameValue('5', 5)).toBe(true);
    expect(sameValue(null, '')).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('تاریخچه — صافیِ نوع', () => {
  it('⚠️ «ارجاعِ تسک» با نوعِ project در تاریخچهٔ پروژهٔ هم‌شناسه نمی‌آید', () => {
    // تاریخچه روی object_type + object_id می‌خواند و با subjectKind صافی می‌کند.
    expect(subjectKind('task.refer', 'project')).not.toBe(subjectKind('project.update', 'project'));
    expect(subjectKind('task.status', 'project')).toBe(subjectKind('project.update', 'project'));
  });
});
