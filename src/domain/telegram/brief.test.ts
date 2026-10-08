import { describe, it, expect } from 'vitest';
import { briefDue, type BriefCheck } from './brief';

const base: BriefCheck = { briefAt: '08:30', local: { date: '2030-01-05', hour: 9, minute: 0 }, lastSent: null, workDays: [], weekday: 0, onLeave: false };

describe('گزارشِ صبحگاهی — مزاحم نشدن', () => {
  it('بعد از ساعتِ انتخابی و فقط یک بار در روز', () => {
    expect(briefDue(base)).toBe(true);
    expect(briefDue({ ...base, local: { ...base.local, hour: 8, minute: 10 } })).toBe(false);
    expect(briefDue({ ...base, lastSent: '2030-01-05' })).toBe(false);
  });
  it('عصر نمی‌فرستد حتی اگر صبح جا مانده', () => {
    expect(briefDue({ ...base, local: { ...base.local, hour: 15 } })).toBe(false);
  });
  it('روزِ تعطیلِ همان نفر و مرخصی نه؛ ساعتِ خالی = خاموش', () => {
    expect(briefDue({ ...base, workDays: [1, 2, 3], weekday: 6 })).toBe(false);
    expect(briefDue({ ...base, workDays: [0, 1], weekday: 0 })).toBe(true);
    expect(briefDue({ ...base, onLeave: true })).toBe(false);
    expect(briefDue({ ...base, briefAt: '' })).toBe(false);
    expect(briefDue({ ...base, briefAt: 'xx' })).toBe(false);
  });
});
