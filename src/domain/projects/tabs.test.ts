import { describe, it, expect } from 'vitest';
import { matchesTab, buildTabs, activeTab, type TabbableProject } from './tabs';

const project = (over: Partial<TabbableProject> = {}): TabbableProject => ({
  statusGroup: 'in_progress', isTender: false, isArchived: false,
  isOverdue: false, reviewCount: 0, ...over,
});

describe('⚠️ بایگانی همه‌جا را رد می‌کند', () => {
  it('پروژهٔ بایگانی‌شده فقط در تبِ بایگانی دیده می‌شود', () => {
    const archived = project({ isArchived: true });
    expect(matchesTab('archived', archived)).toBe(true);
    expect(matchesTab('all', archived)).toBe(false);
    expect(matchesTab('in_progress', archived)).toBe(false);
  });

  it('حتی اگر شرطِ تبِ دیگری را داشته باشد', () => {
    const archived = project({ isArchived: true, isTender: true, isOverdue: true, reviewCount: 3 });
    expect(matchesTab('tender', archived)).toBe(false);
    expect(matchesTab('overdue', archived)).toBe(false);
    expect(matchesTab('review', archived)).toBe(false);
  });
});

describe('تطبیقِ تب', () => {
  it('«همه» شاملِ هر پروژهٔ غیربایگانی است', () => {
    expect(matchesTab('all', project())).toBe(true);
  });

  it('تبِ وضعیت با گروهِ وضعیت تطبیق می‌شود', () => {
    expect(matchesTab('in_progress', project({ statusGroup: 'in_progress' }))).toBe(true);
    expect(matchesTab('completed', project({ statusGroup: 'in_progress' }))).toBe(false);
  });

  it('تب‌های عرضی مستقل از وضعیت‌اند', () => {
    expect(matchesTab('tender', project({ isTender: true }))).toBe(true);
    expect(matchesTab('overdue', project({ isOverdue: true }))).toBe(true);
    expect(matchesTab('review', project({ reviewCount: 2 }))).toBe(true);
    expect(matchesTab('review', project({ reviewCount: 0 }))).toBe(false);
  });

  it('یک پروژه می‌تواند در چند تب باشد', () => {
    const p = project({ statusGroup: 'lead', isTender: true, isOverdue: true });
    expect(matchesTab('all', p)).toBe(true);
    expect(matchesTab('lead', p)).toBe(true);
    expect(matchesTab('tender', p)).toBe(true);
    expect(matchesTab('overdue', p)).toBe(true);
  });
});

describe('ساختِ تب‌ها', () => {
  const projects = [
    project({ statusGroup: 'in_progress' }),
    project({ statusGroup: 'in_progress', reviewCount: 1 }),
    project({ statusGroup: 'lead', isTender: true }),
    project({ isArchived: true }),
  ];

  it('شمارش درست است', () => {
    const tabs = buildTabs(projects);
    const by = new Map(tabs.map((t) => [t.key, t.count]));
    expect(by.get('all')).toBe(3);          // بایگانی شمرده نمی‌شود
    expect(by.get('in_progress')).toBe(2);
    expect(by.get('lead')).toBe(1);
    expect(by.get('tender')).toBe(1);
    expect(by.get('review')).toBe(1);
    expect(by.get('archived')).toBe(1);
  });

  it('تبِ خالی مخفی می‌شود، «همه» هرگز', () => {
    const tabs = buildTabs([]);
    expect(tabs.find((t) => t.key === 'all')!.hidden).toBe(false);
    expect(tabs.find((t) => t.key === 'completed')!.hidden).toBe(true);
  });

  it('اولین تبِ غیرمخفی فعال می‌شود', () => {
    expect(activeTab(buildTabs(projects))).toBe('all');
  });

  it('⚠️ تبِ deep-link حتی وقتی خالی است نمایش داده می‌شود', () => {
    const tabs = buildTabs(projects, 'completed');
    const completed = tabs.find((t) => t.key === 'completed')!;
    expect(completed.count).toBe(0);
    expect(completed.hidden).toBe(false);
    expect(completed.active).toBe(true);
  });

  it('تبِ نامعتبر نادیده گرفته می‌شود', () => {
    expect(activeTab(buildTabs(projects, 'nonsense'))).toBe('all');
  });
});
