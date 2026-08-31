'use client';

import { useEffect, useState, useTransition } from 'react';
import { loadAccessAction, saveAccessAction } from './_form/access-actions';
import { REPORT_TABS, SECTION_ACCESS } from '@/domain/access/staff-levels';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '@/i18n/client';

/**
 * دسترسی‌های همکارِ ادمین.
 *
 * ⚠️ سه توضیحِ نسخهٔ قبلی عمداً نگه داشته شده‌اند؛ بدونِ آن‌ها مالک نمی‌فهمد چرا
 * «مالی» حالتِ مشاهده ندارد یا «فقط ارسال» یعنی چه، و ناخواسته دسترسیِ
 * بیشتری می‌دهد.
 */
export function AccessDialog({
  person,
  open,
  onOpenChange,
  onNotice,
}: {
  person: { id: number; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNotice: (message: string, isError: boolean) => void;
}) {
  const tr = useT();
  const [levels, setLevels] = useState<Record<string, string>>({});
  const [visibleTabs, setVisibleTabs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !person) return;
    setLoading(true);
    // وضعیتِ فعلی از سرور خوانده می‌شود، نه از کارت — تا فرم هیچ‌وقت
    // دسترسیِ کهنه را دوباره ذخیره نکند.
    void loadAccessAction(person.id).then((result) => {
      setLoading(false);
      if (result.error) {
        onNotice(result.error, true);
        onOpenChange(false);
        return;
      }
      setLevels(result.data!.levels);
      setVisibleTabs(result.data!.visibleTabs);
    });
  }, [open, person, onNotice, onOpenChange]);

  const save = () => {
    if (!person) return;
    startTransition(async () => {
      const result = await saveAccessAction(person.id, levels, visibleTabs);
      onNotice(result.error ?? result.message!, Boolean(result.error));
      if (!result.error) onOpenChange(false);
    });
  };

  const reportsGranted = levels.reports === 'view';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("دسترسی‌های همکار ادمین")}</DialogTitle>
          <DialogDescription>
            {person?.name} — برای هر بخش تعیین کنید دسترسی نداشته باشد، فقط ببیند، یا مدیریت کند.
            کارهای حساس (تنظیمات، حذف، بستنِ مالی) همیشه فقط برای مدیرِ کل است.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{tr("در حالِ خواندن…")}</p>
        ) : (
          <div className="grid gap-4">
            {SECTION_ACCESS.map((section) => (
              <fieldset key={section.key} className="grid gap-1.5">
                <legend className="text-sm font-medium">{tr(section.label)}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {section.levels.map((level) => (
                    <label key={level.value} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name={`access-${section.key}`}
                        value={level.value}
                        checked={(levels[section.key] ?? 'none') === level.value}
                        onChange={() => setLevels((s) => ({ ...s, [section.key]: level.value }))}
                        className="size-3.5 accent-primary"
                      />
                      {tr(level.label)}
                    </label>
                  ))}
                </div>

                {section.key === 'finance' && (
                  <p className="text-xs text-muted-foreground">
                    {tr("بخشِ «مالی» فقط حالتِ مدیریت دارد؛ دادنِ آن یعنی دسترسیِ کاملِ مالی مانندِ حسابدار.")}
                  </p>
                )}
                {section.key === 'messages' && (
                  <p className="text-xs text-muted-foreground">
                    {tr("«فقط ارسال» یعنی می‌تواند پیام/اطلاعیه بفرستد ولی صندوق و گفتگوها را نمی‌بیند؛ «ارسال و خواندن» صندوقِ خودش را هم نشان می‌دهد. گفتگوهای خصوصیِ مدیرِ کل هیچ‌گاه دیده نمی‌شوند.")}
                  </p>
                )}

                {section.key === 'reports' && (
                  <div className="mt-1 grid gap-1.5 rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      {tr("اگر «دسترسی» به گزارش‌ها بدهید، تعیین کنید کدام تب‌ها را ببیند (تیک = نمایش):")}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {REPORT_TABS.map((tab) => (
                        <div key={tab.key} className="flex items-center gap-1.5">
                          <Checkbox
                            id={`tab-${tab.key}`}
                            checked={visibleTabs.includes(tab.key)}
                            disabled={!reportsGranted}
                            onCheckedChange={(checked) =>
                              setVisibleTabs((tabs) =>
                                checked ? [...tabs, tab.key] : tabs.filter((t) => t !== tab.key))
                            }
                          />
                          <Label htmlFor={`tab-${tab.key}`} className="text-sm font-normal">
                            {tr(tab.label)}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </fieldset>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tr("انصراف")}</Button>
          <Button type="button" onClick={save} disabled={pending || loading}>
            {pending ? 'در حالِ ذخیره…' : 'ذخیره دسترسی‌ها'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
