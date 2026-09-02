import { describe, expect, it } from 'vitest';
import {
  assignableToPeople, CLIENT_LABEL, nameForViewer, type ViewerContext,
} from './viewer-names';

/** پروژه‌ای با یک عضوِ طراح (۱۰) و یک کارفرما (۲۰). */
const base: ViewerContext = {
  managesProject: false,
  viewerIsClient: false,
  viewerIsMember: false,
  roleByUser: new Map([[10, 'طراح']]),
  clientIds: new Set([20]),
};

describe('نامی که بیننده می‌بیند', () => {
  it('مدیرِ پروژه نامِ واقعیِ همه را می‌بیند', () => {
    const ctx = { ...base, managesProject: true };
    expect(nameForViewer(10, 'سارا', ctx)).toBe('سارا');
    expect(nameForViewer(20, 'شرکتِ آلفا', ctx)).toBe('شرکتِ آلفا');
  });

  it('کارفرما به‌جای نامِ عضو، نقشش را می‌بیند', () => {
    const ctx = { ...base, viewerIsClient: true };
    expect(nameForViewer(10, 'سارا', ctx)).toBe('طراح');
  });

  it('عضو به‌جای نامِ کارفرما، «کارفرما» را می‌بیند', () => {
    const ctx = { ...base, viewerIsMember: true };
    expect(nameForViewer(20, 'شرکتِ آلفا', ctx)).toBe(CLIENT_LABEL);
  });

  it('عضو نامِ عضوِ دیگر را ماسک‌شده نمی‌بیند', () => {
    const ctx = { ...base, viewerIsMember: true };
    expect(nameForViewer(10, 'سارا', ctx)).toBe('سارا');
  });

  /**
   * ⚠️ شرطِ «و نه آن‌یکی»: بدونِ آن، کسی که هم عضو است هم کارفرما بسته به
   * ترتیبِ چک، نامِ همکارانش را نقش می‌دید یا نامِ خودش را «کارفرما».
   */
  it('کسی که هم عضو است هم کارفرما، هیچ ماسکی نمی‌خورد', () => {
    const ctx = { ...base, viewerIsMember: true, viewerIsClient: true };
    expect(nameForViewer(10, 'سارا', ctx)).toBe('سارا');
    expect(nameForViewer(20, 'شرکتِ آلفا', ctx)).toBe('شرکتِ آلفا');
  });

  it('عضوِ بی‌نقش برای کارفرما با نامِ واقعی می‌ماند، نه رشتهٔ خالی', () => {
    const ctx = { ...base, viewerIsClient: true };
    expect(nameForViewer(99, 'کاربرِ بی‌نقش', ctx)).toBe('کاربرِ بی‌نقش');
  });
});

describe('تخصیصِ تسک به شخص', () => {
  it('کارفرمای خالص فقط به نقش می‌دهد، نه به شخص', () => {
    expect(assignableToPeople({ ...base, viewerIsClient: true })).toBe(false);
  });

  it('عضو و مدیر می‌توانند به شخص بدهند', () => {
    expect(assignableToPeople({ ...base, viewerIsMember: true })).toBe(true);
    expect(assignableToPeople({ ...base, managesProject: true })).toBe(true);
  });

  it('کارفرمایی که مدیرِ همین پروژه است، محدود نیست', () => {
    expect(assignableToPeople({ ...base, viewerIsClient: true, managesProject: true })).toBe(true);
  });
});

describe('labels به زبانِ بیننده', () => {
  it('برچسبِ کارفرما از ctx.labels می‌آید، وگرنه فارسیِ مبدأ', () => {
    const base = { managesProject: false, viewerIsClient: false, viewerIsMember: true, roleByUser: new Map<number, string>(), clientIds: new Set([9]) };
    expect(nameForViewer(9, 'Real Client', base)).toBe(CLIENT_LABEL);
    expect(nameForViewer(9, 'Real Client', { ...base, labels: { member: 'Team member', client: 'Client' } })).toBe('Client');
  });
});
