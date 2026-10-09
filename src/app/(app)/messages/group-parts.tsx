'use client';

import { useFreshKey } from '@/hooks/use-fresh-key';
import { UserAvatar } from '@/components/user-avatar';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { AtSign, CircleAlert, SendHorizontal } from 'lucide-react';
import { createChannelAction, type ChannelState, type MessageState } from './_form/actions';
import { splitMentions } from '@/domain/messaging/channels';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/i18n/client';
import { submitOnModEnter } from '@/lib/submit-shortcut';
import { cn } from '@/lib/utils';

/** دکمهٔ ارسال — آیکونی مثلِ هر پیام‌رسان؛ برچسب در تولتیپ و برای صفحه‌خوان. */
export function SendButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <IconButton type="submit" label={label} disabled={pending} className="size-10 shrink-0 rounded-full">
      {pending ? <Spinner /> : <SendHorizontal className="rtl:-scale-x-100" />}
    </IconButton>
  );
}

/**
 * متنِ پیام با منشن‌های برجسته.
 *
 * ⚠️ نامِ هر منشن از سرور می‌آید و برای همین بیننده ساخته شده (ماسکِ R-MSG-03).
 * منشنِ خودِ بیننده و «همه» پررنگ‌ترند تا در گروهِ شلوغ دیده شوند. روی حبابِ
 * خودم (پس‌زمینهٔ رنگیِ اصلی) رنگِ اصلی دیده نمی‌شود، پس آنجا فقط زیرخط.
 */
export function MessageBody({ body, names, viewerId, onPrimary }: {
  body: string;
  names: Record<number, string>;
  viewerId: number;
  onPrimary: boolean;
}) {
  const t = useT();
  return (
    <>
      {splitMentions(body).map((part, i) => {
        if (part.kind === 'text') return <span key={i}>{part.text}</span>;
        const me = part.id === 'all' || part.id === viewerId;
        const label = part.id === 'all' ? t('همه') : names[part.id] ?? '…';
        return (
          <span
            key={i}
            className={cn(
              'font-semibold',
              onPrimary ? 'underline decoration-dotted underline-offset-4' : 'text-primary',
              me && !onPrimary && 'rounded bg-primary/15 px-0.5',
            )}
          >
            @{label}
          </span>
        );
      })}
    </>
  );
}

type Mentionable = { id: number | 'all'; name: string };

/** «ي/ك» ِ عربی = «ی/ک» و نیم‌فاصله نادیده — نام با هر صفحه‌کلیدی پیدا شود. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌ـ]/g, '').trim();
}

/**
 * متنِ نمایشی ← متنِ ذخیره: `@نام` ِ انتخاب‌شده از فهرست به `<@شناسه>`.
 * ⚠️ فقط نام‌هایی که واقعاً از فهرست انتخاب شده‌اند توکن می‌شوند — تایپِ دستیِ
 * «@سارا» منشن نیست. نام‌های بلندتر اول، تا «علی» در «علی‌رضا» توکن نشود.
 */
function toTokens(text: string, picked: Mentionable[]): string {
  let out = text;
  for (const m of [...picked].sort((a, b) => b.name.length - a.name.length)) {
    out = out.split(`@${m.name}`).join(`<@${m.id}>`);
  }
  return out;
}

/**
 * نوارِ نوشتنِ گروه — با فهرستِ منشن.
 *
 * تایپِ «@» فهرستِ اعضای همین گروه را باز می‌کند (با نوشتنِ بقیهٔ نام کوچک
 * می‌شود)؛ بالا/پایین و Enter یا Tab انتخاب می‌کند، Esc می‌بندد. وقتی فهرست
 * بسته است، Ctrl+Enter می‌فرستد و Enter خطِ تازه است — مثلِ بقیهٔ پیام‌ها.
 *
 * ⚠️ این فقط راحتی است، نه گارد: سرور هر منشن را با عضویتِ زنده می‌سنجد.
 */
export function GroupComposer({
  threadId, formAction, state, mentionables, canMentionAll, placeholder,
}: {
  threadId: number;
  formAction: (payload: FormData) => void;
  state: MessageState;
  mentionables: Array<{ id: number; name: string }>;
  canMentionAll: boolean;
  placeholder: string;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Mentionable[]>([]);
  const [menu, setMenu] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  // پس از ارسالِ موفق کادر خالی می‌شود — فرمِ کنترل‌شده خودش پاک نمی‌شود.
  useEffect(() => {
    if (state.ok) { setText(''); setPicked([]); setMenu(null); }
  }, [state]);

  const options = useMemo<Mentionable[]>(() => {
    if (!menu) return [];
    const q = normalize(menu.query);
    const all: Mentionable[] = canMentionAll ? [{ id: 'all', name: t('همه') }] : [];
    return [...all, ...mentionables].filter((o) => normalize(o.name).includes(q)).slice(0, 8);
  }, [menu, mentionables, canMentionAll, t]);

  const detect = (value: string, caret: number) => {
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setMenu(m ? { start: caret - m[2]!.length - 1, query: m[2]! } : null);
    setActive(0);
  };

  const choose = (option: Mentionable) => {
    const el = ref.current;
    if (!el || !menu) return;
    const before = text.slice(0, menu.start);
    const after = text.slice(el.selectionStart);
    const insert = `@${option.name} `;
    setText(before + insert + after);
    setPicked((cur) => [...cur.filter((p) => p.id !== option.id), option]);
    setMenu(null);
    const caret = before.length + insert.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret); });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu && options.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); return; }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault(); choose(options[active]!); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setMenu(null); return; }
    }
    submitOnModEnter(e);
  };

  return (
    <form action={formAction} className="border-t p-3">
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="body" value={toTokens(text, picked)} />
      <div className="relative flex items-end gap-2">
        {menu && options.length > 0 && (
          <ul
            role="listbox"
            aria-label={t('منشن')}
            className="absolute bottom-full start-0 z-20 mb-2 w-64 overflow-hidden rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
          >
            {options.map((o, i) => (
              <li
                key={String(o.id)}
                role="option"
                aria-selected={i === active}
                // ⚠️ mousedown نه click: کلیک فوکوسِ کادر را می‌گرفت و مکانِ نشانگر گم می‌شد.
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5',
                  i === active && 'bg-accent text-accent-foreground',
                )}
              >
                {/* «همه» نشانِ @ دارد؛ هر شخص آواتارِ خودش را. */}
                {o.id === 'all'
                  ? <AtSign className="size-3.5 text-muted-foreground" />
                  : <UserAvatar userId={o.id} name={o.name} size="xs" />}
                <span className="truncate">{o.name}</span>
                {o.id === 'all' && <span className="ms-auto text-xs text-muted-foreground">{t('همهٔ اعضا')}</span>}
              </li>
            ))}
          </ul>
        )}
        <Textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => { setText(e.target.value); detect(e.target.value, e.target.selectionStart); }}
          onClick={(e) => detect(e.currentTarget.value, e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={t('پاسخ شما…')}
          required
          className="max-h-40 min-h-10 resize-none"
        />
        <SendButton label={t('ارسال')} />
      </div>
      {state.error && <p className="mt-2 text-xs text-destructive">{t(state.error)}</p>}
    </form>
  );
}

export interface ChannelOptions {
  roleTags: Array<{ id: number; name: string }>;
  offices: Array<{ id: number; name: string }>;
}

/**
 * «کانالِ تازه» — فقط برای مالک و ادمین (سرور هم می‌سنجد).
 * مخاطب زنده است: هر کس بعداً آن نقش یا دفتر را بگیرد خودکار عضو می‌شود.
 */
function CreateChannelDialogBody({ open, onOpenChange, options, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: ChannelOptions;
  onCreated: (threadId: number) => void;
}) {
  const t = useT();
  const [state, action] = useActionState<ChannelState, FormData>(createChannelAction, {});
  const [type, setType] = useState<'all' | 'role' | 'office'>('all');

  useEffect(() => {
    if (state.ok && state.threadId) { onCreated(state.threadId); setType('all'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('کانالِ تازه')}</DialogTitle>
          <DialogDescription>
            {t('همهٔ اعضای مخاطب در یک گفتگوی مشترک‌اند. پیامِ عادی اعلانی نمی‌فرستد؛ فقط کسی که منشن شود خبر می‌گیرد. کارفرما هرگز عضوِ کانال نیست.')}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-3">
          <Field>
            <FieldLabel htmlFor="ch-title">{t('نامِ کانال')}</FieldLabel>
            <Input id="ch-title" name="title" required maxLength={80} placeholder={t('مثلاً عمومیِ تیم')} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ch-aud">{t('مخاطب')}</FieldLabel>
              <NativeSelect
                id="ch-aud" name="audienceType" containerClassName="w-full"
                value={type} onChange={(e) => setType(e.target.value as typeof type)}
              >
                <NativeSelectOption value="all">{t('همهٔ اعضا')}</NativeSelectOption>
                <NativeSelectOption value="role" disabled={options.roleTags.length === 0}>{t('یک نقش')}</NativeSelectOption>
                <NativeSelectOption value="office" disabled={options.offices.length === 0}>{t('یک دفتر')}</NativeSelectOption>
              </NativeSelect>
            </Field>
            {type === 'role' && (
              <Field>
                <FieldLabel htmlFor="ch-role">{t('نقش')}</FieldLabel>
                <NativeSelect id="ch-role" name="roleTagId" containerClassName="w-full" required>
                  {options.roleTags.map((r) => <NativeSelectOption key={r.id} value={r.id}>{r.name}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            )}
            {type === 'office' && (
              <Field>
                <FieldLabel htmlFor="ch-office">{t('دفتر')}</FieldLabel>
                <NativeSelect id="ch-office" name="officeId" containerClassName="w-full" required>
                  {options.offices.map((o) => <NativeSelectOption key={o.id} value={o.id}>{o.name}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            )}
          </div>
          <Field>
            <FieldLabel htmlFor="ch-body">{t('پیامِ اول (اختیاری)')}</FieldLabel>
            <Textarea id="ch-body" name="body" rows={3} onKeyDown={submitOnModEnter} />
            <FieldDescription>{t('مدیران همیشه عضوِ هر کانال‌اند. عضوِ تازهٔ همان نقش یا دفتر خودکار اضافه می‌شود.')}</FieldDescription>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox name="announceOnly" className="mt-0.5" />
            {t('فقط اعلان — فقط مدیران در این کانال می‌نویسند')}
          </label>
          {state.error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{t(state.error)}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('انصراف')}</Button>
            <CreateButton label={t('ساختِ کانال')} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? <Spinner /> : label}</Button>;
}

/** ⚠️ هر باز شدن از نو — انتخابِ ذخیره‌نشده با بستن دور ریخته می‌شود (۲.۱۷.۱). */
export function CreateChannelDialog(props: Parameters<typeof CreateChannelDialogBody>[0]) {
  const key = useFreshKey(props.open);
  return <CreateChannelDialogBody key={key} {...props} />;
}
