'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n/client';

/**
 * نوارِ فیلترِ ریزِ ساعت — پورتِ `hours-filters.php`.
 *
 * ⚠️ پیش‌فرض‌ها **در کلاینت** ساخته می‌شوند چون به «امروزِ» کاربر بستگی
 * دارند، نه به ساعتِ سرور. تاریخِ سرور می‌توانست یک روز جلو یا عقب باشد.
 */
export function HoursFilter({
  userId,
  projects,
}: {
  userId: number;
  projects: Array<{ id: number; title: string }>;
}) {
  const tr = useT();
  const router = useRouter();
  const params = useSearchParams();

  const value = (key: string) => params.get(key) ?? '';

  const go = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === '') next.delete(k);
      else next.set(k, v);
    }
    router.push(`/reports/hours/${userId}?${next.toString()}`);
  };

  const today = new Date().toISOString().slice(0, 10);
  const presets = [
    { key: 'week', label: tr('این هفته'), from: shift(today, -7) },
    { key: 'month', label: tr('این ماه'), from: `${today.slice(0, 7)}-01` },
    { key: 'year', label: tr('امسال'), from: `${today.slice(0, 4)}-01-01` },
    { key: 'all', label: tr('همهٔ زمان'), from: '' },
  ];

  const cell = 'h-9 rounded-md border bg-background px-2 text-sm';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        go({
          from: String(data.get('from') ?? ''),
          to: String(data.get('to') ?? ''),
          project: String(data.get('project') ?? ''),
        });
      }}
      className="flex flex-wrap items-end gap-2 rounded-md border p-3"
    >
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={value('from') === p.from ? 'default' : 'outline'}
            className="h-8"
            onClick={() => go({ from: p.from, to: p.from === '' ? '' : today })}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="hf-project" className="text-xs">{tr('پروژه')}</Label>
        <select id="hf-project" name="project" defaultValue={value('project')} className={cell}>
          <option value="">{tr('همهٔ پروژه‌ها')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="hf-from" className="text-xs">{tr('از')}</Label>
        <Input id="hf-from" name="from" type="date" className="num h-9 w-[9.5rem]" defaultValue={value('from')} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="hf-to" className="text-xs">{tr('تا')}</Label>
        <Input id="hf-to" name="to" type="date" className="num h-9 w-[9.5rem]" defaultValue={value('to')} />
      </div>

      <Button type="submit" size="sm">{tr('اعمال')}</Button>
    </form>
  );
}

function shift(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
