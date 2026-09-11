'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { PersonCard, type PersonView, type SectionConfig } from './person-card';
import { PersonDialog, type PersonFormOptions } from './person-dialog';
import { AccessDialog } from './access-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { CardPager, useCardPage } from '@/components/ui/card-pager';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import { Badge } from '@/components/ui/badge';

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
  const { show } = useToast();
  const [tab, setTab] = useState<'active' | 'former'>('active');
  const [query, setQuery] = useState('');
  const [officeIds, setOfficeIds] = useState<number[]>([]);
  const [editing, setEditing] = useState<PersonView | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
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
      // جستجو روی نام، ایمیل **و نامِ کاربری** — همان `name_attr` ِ نسخهٔ قبلی.
      .filter((p) => (q ? `${p.name} ${p.email} ${p.username ?? ''}`.toLowerCase().includes(q) : true))
      .filter((p) => (officeIds.length === 0 ? true : p.offices.some((o) => officeIds.includes(o.id))));
  }, [people, tab, query, officeIds, section.supportsOffboarding]);

  // ⚠️ کوئریِ افراد `LIMIT` ندارد؛ بریدن اینجا اتفاق می‌افتد.
  const pager = useCardPage(visible);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (person: PersonView) => { setEditing(person); setDialogOpen(true); };

  const toggleOffice = (id: number) =>
    setOfficeIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {section.supportsOffboarding && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="active" className="flex-none px-3">
                  {section.role === 'member' ? t('اعضای فعال') : t('فعال')}
                  <Badge variant="secondary" className="num px-1.5 py-0 text-[10px]">{counts.active}</Badge>
                </TabsTrigger>
                <TabsTrigger value="former" className="flex-none px-3">
                  {section.role === 'member' ? t('اعضای سابق') : t('سابق')}
                  <Badge variant="secondary" className="num px-1.5 py-0 text-[10px]">{counts.former}</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-4" />
            {t(section.addLabel)}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("جستجوی نام یا ایمیل…")}
          className="max-w-xs"
        />
        {section.supportsOffices && offices.map((o) => (
          <Toggle
            key={o.id}
            variant="outline"
            size="sm"
            pressed={officeIds.includes(o.id)}
            onPressedChange={() => toggleOffice(o.id)}
            className="h-7 rounded-full px-3 text-xs font-normal data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
          >
            {o.name}
          </Toggle>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={!section.supportsOffboarding || tab === 'active' ? t('کسی پیدا نشد') : t('موردِ سابقی نیست')}
          description={query || officeIds.length > 0 ? t('فیلترها را بردارید.') : undefined}
        />
      ) : (
        <div className="grid gap-3 @3xl/main:grid-cols-3 @xl/main:grid-cols-2">
          {pager.slice.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              section={section}
              canManage={canManage}
              canViewReports={canViewReports}
              isOwner={isOwner}
              onEdit={openEdit}
              onAccess={(p) => { setAccessFor(p); setAccessOpen(true); }}
              onNotice={(text, isError) => show(t(text), isError ? 'error' : 'success')}
            />
          ))}
        </div>
      )}

      <CardPager {...pager} />

      {isOwner && (
        <AccessDialog
          person={accessFor}
          open={accessOpen}
          onOpenChange={setAccessOpen}
          onNotice={(text, isError) => show(t(text), isError ? 'error' : 'success')}
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
