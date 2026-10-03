'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, FolderKanban, MessagesSquare } from 'lucide-react';
import { createProjectGroupAction } from '../../messages/_form/actions';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/i18n/client';
import { PROJECT_GROUP_RETENTION_DAYS } from '@/domain/messaging/channels';

export interface ProjectChat {
  /** گروهِ موجود؛ `null` یعنی هنوز ساخته نشده. */
  threadId: number | null;
  unread: number;
  /** مدیر یا مدیرِ همین پروژه، و پروژه بایگانی نیست. */
  canCreate: boolean;
  archived: boolean;
}

/**
 * تبِ «گروهِ گفتگو» در صفحهٔ پروژه — دریچه به گروهِ همین پروژه در «پیام‌ها».
 *
 * ⚠️ خودِ گفتگو اینجا کشیده نمی‌شود: یک گفتگو با دو پیاده‌سازی (اینجا و صفحهٔ
 * پیام‌ها) یعنی هر بهبودی دو بار و یکی همیشه عقب. این تب می‌گوید گروه هست یا
 * نه، چند پیامِ خوانده‌نشده دارد، و می‌سازد یا باز می‌کند.
 * کارفرما این تب را اصلاً نمی‌گیرد (سرور برایش `null` می‌دهد).
 */
export function ChatTab({ projectId, chat }: { projectId: number; chat: ProjectChat }) {
  const t = useT();
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();

  const create = () => startTransition(async () => {
    const result = await createProjectGroupAction(projectId);
    if (result.error || !result.threadId) { show(t(result.error ?? 'گروه ساخته نشد.'), 'error'); return; }
    router.push(`/messages/${result.threadId}`);
  });

  return (
    <div className="grid gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FolderKanban className="size-5" />
        </span>
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold">{t('گروهِ گفتگوی پروژه')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('گفتگوی داخلیِ تیمِ همین پروژه — اعضای پروژه، مدیرِ دفتر و مدیران. کارفرما آن را نمی‌بیند؛ گفتگوی رسمی با کارفرما در تبِ «کامنت‌ها» است.')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('پیامِ تازه در برنامه و تلگرام خبر می‌دهد (جمع‌شده، نه یکی‌یکی) و منشن با ایمیل هم می‌رسد. پیام‌ها {days} روز می‌مانند و با سبک‌سازی یا حذفِ پروژه پاک می‌شوند.', { days: PROJECT_GROUP_RETENTION_DAYS })}
          </p>
        </div>
      </div>

      {chat.archived && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Archive className="size-3.5" />
          {t('این پروژه بایگانی شده است؛ گروهش فقط‌خواندنی است.')}
        </p>
      )}

      <div>
        {chat.threadId ? (
          <Button asChild>
            <Link href={`/messages/${chat.threadId}`}>
              <MessagesSquare />
              {t('باز کردنِ گروه')}
              {chat.unread > 0 && (
                <span className="num rounded-full bg-primary-foreground/20 px-1.5 text-xs">{chat.unread}</span>
              )}
            </Link>
          </Button>
        ) : (
          <Button onClick={create} disabled={pending}>
            {pending ? <Spinner /> : <MessagesSquare />}
            {t('ساختِ گروهِ گفتگو')}
          </Button>
        )}
      </div>
    </div>
  );
}
