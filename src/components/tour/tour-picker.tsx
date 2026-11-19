'use client';

import { CheckCircle2, PlayCircle, Sparkles } from 'lucide-react';
import { useT } from '@/i18n/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTour } from './tour-provider';

/**
 * «راهنمای برنامه» (۳.۱۹.۰) — فهرستِ راهنماهای نقشِ کاربر، با نشانِ «دیده‌شده»، برای دیدنِ دوباره هر وقت.
 */
export function TourPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const tour = useTour();
  if (!tour) return null;
  const { available, state, start, disabled } = tour;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />{t('راهنمای برنامه')}</DialogTitle>
          <DialogDescription>{t('راهنماهای قدم‌به‌قدم برای کارهایی که در برنامه انجام می‌دهید. هر کدام را هر وقت خواستید دوباره ببینید.')}</DialogDescription>
        </DialogHeader>
        {disabled && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t('در حالتِ «دیدن به‌جای کاربر» راهنما اجرا نمی‌شود.')}</p>}
        {available.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('هنوز راهنمایی برای نقشِ شما نیست.')}</p>
        ) : (
          <ul className="grid divide-y rounded-xl border">
            {available.map((x) => {
              const seen = state.done?.[x.id] && !state.done[x.id]!.startsWith('skipped:');
              return (
                <li key={x.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {t(x.title)}
                      {seen && <CheckCircle2 className="size-3.5 text-emerald-600" aria-label={t('دیده‌شده')} />}
                    </span>
                    <span className="text-xs text-muted-foreground">{t(x.description)}</span>
                  </span>
                  <Button type="button" size="sm" variant={seen ? 'outline' : 'default'} disabled={disabled} onClick={() => start(x.id)}>
                    <PlayCircle className="size-3.5" />{seen ? t('دوباره') : t('شروع')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
