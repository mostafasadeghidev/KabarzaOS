'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { useT } from '@/i18n/client';

/**
 * فیلدِ رمز با دکمهٔ چشم (۲.۵۵.۰) — کاربر می‌بیند چه تایپ می‌کند.
 * `className` به قابِ بیرونی می‌رود (پهنا و ارتفاع)، بقیهٔ ویژگی‌ها به خودِ input.
 * ⚠️ همیشه پنهان شروع می‌شود؛ دیدن یک کارِ آگاهانه است، نه پیش‌فرض.
 * ⚠️ رمز و کلید چپ‌به‌راست‌اند، پس دکمه همیشه سمتِ «پایان» ِ فیلد است.
 */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  const tr = useT();
  const [shown, setShown] = React.useState(false);
  return (
    <InputGroup className={className}>
      <InputGroupInput {...props} type={shown ? 'text' : 'password'} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={shown ? tr('پنهان کردنِ رمز') : tr('نمایشِ رمز')}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
