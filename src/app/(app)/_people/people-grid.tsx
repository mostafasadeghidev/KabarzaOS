'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { PersonCard, type PersonView, type SectionConfig } from './person-card';
import { PersonDialog, type PersonFormOptions } from './person-dialog';
import { AccessDialog } from './access-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { useT } from '@/i18n/client';

/**
 * شبکهٔ افراد — بازسازیِ `tab_panel_html()`:
 * زیرتبِ «فعال / سابق» با شمارنده ← جستجوی زنده ← فیلترِ چنددفتری ← کارت‌ها.
 *
 * ⚠️ مثلِ نسخهٔ قبلی، تب و جستجو و فیلتر همه **سمتِ کلاینت** کار می‌کنند تا
 * جابه‌جایی فوری باشد و انتخابِ دفتر با هر تب عوض‌کردن از دست نرود.
 *
 * زیرتب و فیلترِ دفتر با پرچم‌های `section` روشن/خاموش می‌شوند — کارفرمایان
 * هیچ‌کدام را ندارند، دقیقاً مثلِ.
 */
export function PeopleGrid({
  people,
  offices,
  options,
  section,
  canManage,
  canViewReports,
  isOwner,
}: {
  people: PersonView[];
  offices: Array<{ id: number; name: string }>;
  options: PersonFormOptions;
  section: SectionConfig;
  canManage: boolean;
  canViewReports: boolean;
  isOwner: boolean;
}) {
  const t = useT();
  const [tab, setTab] = useState<'active' | 'former'>('active');
  const [query, setQuery] = useState('');
  const [officeIds, setOfficeIds] = useState<number[]>([]);
  const [editing, setEditing] = useState<PersonView | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [accessFor, setAccessFor] = useState<PersonView | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);

  const counts = useMemo(() => ({
    active: people.filter((p) => p.memberState === 'active').length,
    former: people.filter((p) => p.memberState !== 'active').length,
  }), [people]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      // بدونِ off-boarding همه دیده می‌شوند — تبی در کار نیست.
      .filter((p) => (!section.supportsOffboarding
        ? true
        : tab === 'active' ? p.memberState === 'active' : p.memberState !== 'active'))
      // جستجو روی نام **و ایمیل** — همان `name_attr` ِ نسخهٔ قبلی.
      .filter((p) => (q ? `${p.name} ${p.email}`.toLowerCase().includes(q) : true))
      .filter((p) => (officeIds.length === 0 ? true : p.offices.some((o) => officeIds.includes(o.id))));
  }, [people, tab, query, officeIds, section.supportsOffboarding]);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (person: PersonView) => { setEditing(person); setDialogOpen(true); };

  const toggleOffice = (id: number) =>
    setOfficeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {section.supportsOffboarding && (
          <>
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === 'active' ? 'bg-primary/10 font-medium' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {section.role === 'member' ? t('اعضای فعال') : t('فعال')} (<span className="num">{counts.active}</span>)
          </button>
          <button
            type="button"
            onClick={() => setTab('former')}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === 'former' ? 'bg-primary/10 font-medium' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {section.role === 'member' ? t('اعضای سابق') : t('سابق')} (<span className="num">{counts.former}</span>)
          </button>
          </>
          )}
        </div>

        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-4" />
            {t(section.addLabel)}
          </Button>
        )}
      </div>

      {/* ⚠️ پیام اینجاست نه روی کارت — اقدام‌های off-boarding کارت را به تبِ
          دیگری می‌برند و پیامِ روی کارت با آن ناپدید می‌شد. */}
      {notice && (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            notice.isError
              ? 'bg-destructive/10 text-destructive'
              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {t(notice.text)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("جستجوی نام یا ایمیل…")}
          className="max-w-xs"
        />
        {section.supportsOffices && offices.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => toggleOffice(o.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              officeIds.includes(o.id)
                ? 'border-primary bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {o.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={!section.supportsOffboarding || tab === 'active' ? t('کسی پیدا نشد') : t('موردِ سابقی نیست')}
          description={query || officeIds.length > 0 ? t('فیلترها را بردارید.') : undefined}
        />
      ) : (
        <div className="grid gap-3 @3xl/main:grid-cols-3 @xl/main:grid-cols-2">
          {visible.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              section={section}
              canManage={canManage}
              canViewReports={canViewReports}
              isOwner={isOwner}
              onEdit={openEdit}
              onAccess={(p) => { setAccessFor(p); setAccessOpen(true); }}
              onNotice={(text, isError) => setNotice({ text, isError })}
            />
          ))}
        </div>
      )}

      {isOwner && (
        <AccessDialog
          person={accessFor}
          open={accessOpen}
          onOpenChange={setAccessOpen}
          onNotice={(text, isError) => setNotice({ text, isError })}
        />
      )}

      {canManage && (
        <PersonDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          person={editing}
          options={options}
          section={section}
        />
      )}
    </div>
  );
}
