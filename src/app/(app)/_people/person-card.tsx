'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Building2, KeyRound, Lock, Mail, MoreVertical, Phone, RotateCcw, Trash2, Wallet, XCircle,
} from 'lucide-react';
import {
  removePersonAction, setPersonPasswordAction, setStateAction, type PasswordState,
} from './_form/actions';
import { stateLabel, type MemberState } from '@/domain/people/offboarding';
import { Thumb } from '@/components/thumb';
import { PresenceDot } from '@/components/presence';
import type { PresenceState } from '@/domain/people/presence';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n/client';

export interface PersonView {
  id: number;
  name: string;
  email: string;
  phone: string;
  memberState: MemberState;
  /** تصویرِ پروفایل؛ null ← تک‌نگار. */
  avatarFileId: number | null;
  /** حضورِ زنده. */
  presence: PresenceState | null;
  /** «همکارِ ادمین» است؟ فقط این افراد دسترسیِ پیکربندی‌شدنی دارند. */
  isStaff: boolean;
  /** رمز دارد؟ اگر نه، هنوز نمی‌تواند وارد شود. */
  hasPassword: boolean;
  /** گرنتِ دیدنِ پروژه‌های خصوصی — نقش نیست، گرنتِ per-user است. */
  privateAccess: boolean;
  offices: Array<{ id: number; name: string; manages: boolean }>;
  tags: Array<{ id: number; name: string; color: string | null }>;
}

/**
 * پیکربندیِ بخش — معادلِ چهار پرچمِ در نسخهٔ قبلی
 * (نقش · تگ‌ها · دفاتر · off-boarding).
 */
export interface SectionConfig {
  role: 'member' | 'client';
  title: string;
  addLabel: string;
  editLabel: string;
  /** تگِ نقش دارد؟ (اعضا آری، کارفرمایان نه) */
  supportsTags: boolean;
  supportsOffices: boolean;
  /** زیرتبِ فعال/سابق و منوی سه‌حالتی دارد؟ */
  supportsOffboarding: boolean;
}

/**
 * کارتِ یک نفر — بازسازیِ `person_card_html()`:
 * آواتار · نام · ایمیل · تلفن · دفتر(ها) · تگِ نقش · نشانِ «سابق».
 *
 * ⚠️ منوی اقدام سه‌حالتیِ off-boarding را نشان می‌دهد (R-PEOPLE-01)، نه یک
 * کلیدِ فعال/غیرفعال.
 */
export function PersonCard({
  person,
  section,
  canManage,
  canViewReports,
  isOwner,
  onEdit,
  onAccess,
  onNotice,
}: {
  person: PersonView;
  section: SectionConfig;
  /** پیوندِ نام به پروفایلِ گزارش‌ها ساخته شود؟ سرور تصمیم می‌گیرد. */
  canViewReports: boolean;
  canManage: boolean;
  /** ⚠️ فقط مالک «دسترسی‌ها» را می‌بیند (R-RBAC-10). */
  isOwner: boolean;
  onEdit: (person: PersonView) => void;
  onAccess: (person: PersonView) => void;
  /**
   * ⚠️ پیام به **شبکه** گزارش می‌شود، نه روی خودِ کارت.
   * چون اقدام‌های off-boarding کارت را به تبِ دیگری می‌برند و کارت unmount
   * می‌شود — مهم‌ترین پیام («حذف نشد، قطع شد») هرگز دیده نمی‌شد.
   */
  onNotice: (message: string, isError: boolean) => void;
}) {
  const tr = useT();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordState, setPasswordState] = useState<PasswordState>({});
  // ⚠️ ref، نه state: تایپِ رمز نباید هر نویسه کارت را دوباره رندر کند.
  const newPassword = useRef('');
  const [pending, startTransition] = useTransition();

  // بدونِ off-boarding، حالتِ عضو اصلاً نمایش داده نمی‌شود (کارفرما «سابق» ندارد).
  const label = section.supportsOffboarding ? stateLabel(person.memberState) : null;
  const isFormer = section.supportsOffboarding && person.memberState !== 'active';

  const run = (fn: () => Promise<{ error?: string; message?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) onNotice(result.error, true);
      else if (result.message) onNotice(result.message, false);
    });

  return (
    <Card className={`gap-2 py-4 ${isFormer ? 'opacity-75' : ''}`}>
      <CardContent className="grid gap-2 px-4">
        <div className="flex items-start gap-3">
          <Thumb id={person.id} title={person.name} fileId={person.avatarFileId} className="rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {/* حضورِ خاموش ← بی‌نقطه، نه نقطهٔ خاکستریِ گمراه‌کننده. */}
              {person.presence && <PresenceDot state={person.presence} />}
              {/*
                پورتِ `profile_url`: نامِ عضو به تبِ «اعضا» و نامِ کارفرما به
                تبِ «کارفرمایانِ» گزارش‌ها می‌رود — همان‌جا که نسخهٔ قبلی هم
                می‌بُرد. بدونِ مجوزِ گزارش‌ها متنِ ساده می‌ماند.
              */}
              {canViewReports ? (
                <Link
                  href={`/reports/${section.role === 'client' ? 'client' : 'member'}/${person.id}`}
                  className="hover:underline"
                >
                  {person.name}
                </Link>
              ) : (
                person.name
              )}
            </p>
            {label && <Badge variant="outline" className="mt-0.5">{label}</Badge>}
          </div>

          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-60"
                disabled={pending}
                aria-label={tr("اقدام‌ها")}
              >
                <MoreVertical className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(person)}>{section.editLabel}</DropdownMenuItem>
                {isOwner && person.isStaff && (
                  <DropdownMenuItem onSelect={() => onAccess(person)}>
                    <KeyRound className="size-3.5" />
                    {tr("دسترسی‌ها")}
                  </DropdownMenuItem>
                )}
                {/*
                  ⚠️ جدا از فرمِ ویرایش، عمداً: با یک ذخیرهٔ اتفاقیِ فرم
                  نباید رمزِ کسی بی‌خبر عوض شود.
                */}
                {canManage && (
                  <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
                    <Lock className="size-3.5" />
                    {person.hasPassword ? tr("تغییرِ رمزِ ورود") : tr("تعیینِ رمزِ ورود")}
                  </DropdownMenuItem>
                )}
                {section.supportsOffboarding && <DropdownMenuSeparator />}

                {section.supportsOffboarding && person.memberState !== 'active' && (
                  <DropdownMenuItem onSelect={() => run(() => setStateAction(person.id, 'active', section.role))}>
                    <RotateCcw className="size-3.5" />
                    {tr("بازفعال‌سازی")}
                  </DropdownMenuItem>
                )}
                {section.supportsOffboarding && person.memberState !== 'finance' && (
                  <DropdownMenuItem onSelect={() => run(() => setStateAction(person.id, 'finance', section.role))}>
                    <Wallet className="size-3.5" />
                    {tr("عضو سابق (فقط مالی)")}
                  </DropdownMenuItem>
                )}
                {section.supportsOffboarding && person.memberState !== 'locked' && (
                  <DropdownMenuItem onSelect={() => run(() => setStateAction(person.id, 'locked', section.role))}>
                    <XCircle className="size-3.5" />
                    {tr("قطع کامل دسترسی")}
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => run(() => removePersonAction(person.id, section.role))}
                >
                  <Trash2 className="size-3.5" />
                  {tr("حذف")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <dl className="grid gap-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Mail className="size-3" />
            <dd className="num truncate">{person.email}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="size-3" />
            <dd className="num">{person.phone || '—'}</dd>
          </div>
          {section.supportsOffices && person.offices.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Building2 className="size-3" />
              <dt>{person.offices.length > 1 ? 'دفاتر' : 'دفتر'}</dt>
              <dd>
                {person.offices.map((o) => o.name + (o.manages ? ' ★' : '')).join('، ')}
              </dd>
            </div>
          )}
        </dl>

        {section.supportsTags && person.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {person.tags.map((t) => (
              <Badge
                key={t.id}
                className="text-white"
                style={{ backgroundColor: t.color ?? 'oklch(0.55 0.13 280)' }}
              >
                {t.name}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      {/* تعیینِ رمز — فرمِ کوچکِ جدا. */}
      {passwordOpen && (
        <CardContent className="grid gap-2 border-t px-4 pt-3">
          <Label htmlFor={`pw-${person.id}`} className="text-xs">
            {tr("رمزِ تازه برای")} {person.name}
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={`pw-${person.id}`}
              type="password"
              autoComplete="new-password"
              minLength={8}
              className="h-8 max-w-56"
              placeholder={tr("دستِ‌کم ۸ نویسه")}
              onChange={(e) => { newPassword.current = e.target.value; }}
            />
            <Button
              size="sm"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const result = await setPersonPasswordAction(person.id, newPassword.current);
                setPasswordState(result);
                if (result.message) setPasswordOpen(false);
              })}
            >
              {tr("ذخیرهٔ رمز")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPasswordOpen(false)}>
              {tr("انصراف")}
            </Button>
          </div>
          {passwordState.error && (
            <p className="text-xs text-destructive">{passwordState.error}</p>
          )}
          {!person.hasPassword && !passwordState.error && (
            <p className="text-xs text-muted-foreground">
              {tr("این فرد هنوز رمزی ندارد و نمی‌تواند وارد شود.")}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
