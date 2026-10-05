'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KeyRound, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n/client';
import { PersonDialog, type PersonFormOptions } from '../../_people/person-dialog';
import type { PersonView, SectionConfig } from '../../_people/person-card';

/**
 * اقدام‌های سرصفحهٔ «تیمِ من ← عضو»: ویرایشِ عضو و دفترِ دسترسی‌های بیرونی.
 *
 * ⚠️ همان دیالوگ و همان گاردهای صفحهٔ «اعضا» — اینجا فقط میان‌بُر است تا مدیر
 * برای ویرایشِ کسی که دارد نگاهش می‌کند صفحه عوض نکند. هر دکمه فقط با مجوزِ
 * خودش دیده می‌شود (`members.manage` برای ویرایش، `members.view` برای دفتر).
 */
export function TeamMemberActions({
  person,
  options,
  section,
  canManage,
}: {
  person: PersonView;
  options: PersonFormOptions;
  section: SectionConfig;
  canManage: boolean;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href={`/access?user=${person.id}`} prefetch={false}>
          <KeyRound className="size-3.5" />
          {tr('دسترسی‌های بیرونی')}
          {person.openGrants > 0 && <Badge variant="secondary" className="num">{person.openGrants}</Badge>}
        </Link>
      </Button>
      {canManage && (
        <>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Pencil className="size-3.5" />
            {tr(section.editLabel)}
          </Button>
          <PersonDialog
            key={person.id}
            open={open}
            onOpenChange={setOpen}
            person={person}
            options={options}
            section={section}
          />
        </>
      )}
    </div>
  );
}
