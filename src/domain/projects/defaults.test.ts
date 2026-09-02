import { describe, expect, it } from 'vitest';
import { defaultProjectStatusId, defaultTaskStatusId } from './defaults';

const projectTags = [
  { id: 1, group: 'not_started' },
  { id: 2, group: 'lead' },
  { id: 3, group: 'in_progress' },
];

describe('وضعیتِ پیش‌فرضِ پروژه', () => {
  it('⚠️ مناقصه در «احتمالِ عقد قرارداد» شروع می‌شود، وگرنه هیچ‌کس نمی‌توانست پیشنهاد بدهد', () => {
    expect(defaultProjectStatusId(projectTags, true)).toBe(2);
  });

  it('پروژهٔ عادی در «شروع نشده»', () => {
    expect(defaultProjectStatusId(projectTags, false)).toBe(1);
  });

  it('گروهِ موردِ انتظار که نباشد، بی‌وضعیت — نه یک تگِ اتفاقی', () => {
    expect(defaultProjectStatusId([{ id: 9, group: 'completed' }], false)).toBeNull();
  });
});

describe('وضعیتِ پیش‌فرضِ تسک', () => {
  it('اولین تگِ گروهِ todo', () => {
    expect(defaultTaskStatusId([
      { id: 5, group: 'in_progress' }, { id: 6, group: 'todo' }, { id: 7, group: 'todo' },
    ])).toBe(6);
  });

  it('در نبودِ todo اولین تگ، و بدونِ تگ هیچ', () => {
    expect(defaultTaskStatusId([{ id: 5, group: 'in_progress' }])).toBe(5);
    expect(defaultTaskStatusId([])).toBeNull();
  });
});
