'use client';

import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * Ctrl+Enter (در مک ⌘+Enter) فرمِ کادرِ متن را می‌فرستد؛ Enter ِ تنها همان خطِ
 * تازه می‌ماند تا پیامِ چندخطی بی‌دردسر نوشته شود و چیزی ناخواسته نرود.
 *
 * ⚠️ `isComposing`: هنگامِ نوشتن با ویرایشگرِ ورودی (IME) Enter انتخابِ حرف است، نه ارسال.
 * ⚠️ اگر دکمهٔ ارسالِ فرم غیرفعال است (ارسالِ قبلی هنوز در جریان)، کاری نمی‌کند:
 * Ctrl+Enter ِ پشتِ سرِ هم پیام را دو بار نمی‌فرستد.
 * ⚠️ `requestSubmit` نه `submit`: اعتبارسنجیِ فرم (فیلدِ اجباری) و اکشنِ React اجرا می‌شوند.
 */
export function submitOnModEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.nativeEvent.isComposing) return;
  const form = event.currentTarget.form;
  if (!form) return;
  event.preventDefault();
  if (form.querySelector('[type="submit"]:disabled')) return;
  form.requestSubmit();
}

/**
 * نامِ کلید برای راهنما: «Ctrl+Enter»، و در مک «⌘+Enter».
 * ⚠️ پس از mount خوانده می‌شود: سرور سیستم‌عاملِ بیننده را نمی‌داند و متنِ متفاوت
 * در رندرِ سرور و مرورگر خطای hydration می‌داد.
 */
export function useModEnterLabel(): string {
  const [label, setLabel] = useState('Ctrl+Enter');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setLabel('⌘+Enter');
  }, []);
  return label;
}
