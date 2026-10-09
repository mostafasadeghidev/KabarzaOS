'use client';

import { useEffect, useState, useTransition } from 'react';
import { projectCodeAction, saveProjectCodeAction } from './_form/project-code-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { Panel } from '@/components/page-shell';
import { useT } from '@/i18n/client';

/**
 * کدِ کوتاهِ پروژه (۲.۱۶.۰) — ارجاعِ تسک بیرون از پروژه: «ALZ-325» در
 * «تسک‌های من»، جستجوی Ctrl+K، تلگرام و کامنت‌ها. داخلِ پروژه همان «#325» است.
 */
export function ProjectCodePanel({ projectId }: { projectId: number }) {
  const t = useT();
  const { show } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    projectCodeAction(projectId).then((c) => { if (alive && c !== null) { setCode(c); setDraft(c); } });
    return () => { alive = false; };
  }, [projectId]);

  if (code === null) return null;

  const save = () => startTransition(async () => {
    const r = await saveProjectCodeAction(projectId, draft);
    if (r.error) { show(t(r.error), 'error'); return; }
    setCode(r.code!); setDraft(r.code!);
    show(t('کدِ پروژه ذخیره شد.'), 'success');
  });

  return (
    <Panel title={t('کدِ پروژه')}>
      <p className="text-xs text-muted-foreground">
        {t('هر تسک در این پروژه یک شماره دارد (#325). بیرون از پروژه — تسک‌های من، جستجو، تلگرام — با این کد نوشته می‌شود: {example}. کارفرما شماره‌ها را نمی‌بیند.', { example: `${code}-325` })}
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); save(); }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          maxLength={6}
          dir="ltr"
          className="num h-8 w-28 font-mono uppercase"
          aria-label={t('کدِ پروژه')}
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending || draft === code}>
          {t('ذخیره')}
        </Button>
        <span className="text-xs text-muted-foreground">{t('۲ تا ۶ حرف یا رقمِ انگلیسی')}</span>
      </form>
    </Panel>
  );
}
