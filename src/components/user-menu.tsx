'use client';

import { ChevronsUpDown, LogOut, Moon, Sun, Monitor, Settings } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/config';
import { useTheme, type ThemePreference } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/client';

/**
 * منویِ کاربر در فوترِ سایدبار.
 *
 * ⚠️ `side="top"` — منو **بالای** دکمه باز می‌شود، نه کنارش (چون دکمه ته
 * صفحه است و منوی کناری از کادر بیرون می‌زند).
 *
 * زبان و تم به‌صورتِ ردیفِ درون‌خطی‌اند، نه زیرمنو: انتخابِ فعلی بدونِ باز
 * کردنِ منوی دوم دیده می‌شود و یک کلیک کمتر می‌خواهد.
 */

/** حروفِ اولِ نام برای آواتار — با فارسی و لاتین کار می‌کند. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? '') + (parts[1]![0] ?? '')).toUpperCase();
}

const THEME_NEXT: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const THEME_LABEL: Record<ThemePreference, string> = {
  light: 'حالت روشن',
  dark: 'حالت تاریک',
  system: 'مطابق سیستم',
};

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

export function UserMenu({
  userName,
  userRole,
  locale,
  onLogout,
  onLocaleChange,
}: {
  userName: string;
  userRole: string;
  locale: Locale;
  onLogout: () => void;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const ThemeIcon = THEME_ICON[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
          <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <span className="text-xs font-semibold">{initials(userName)}</span>
          </div>
          <div className="grid flex-1 text-start leading-tight">
            <span className="truncate text-sm font-medium">{userName}</span>
            <span className="truncate text-xs text-muted-foreground">{userRole}</span>
          </div>
          <ChevronsUpDown className="size-4 opacity-50" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      {/* بالای دکمه، هم‌عرضِ خودِ سایدبار */}
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
      >
        <DropdownMenuLabel className="text-sm font-medium">{userName}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/*
          زبان — فهرستِ بازشونده.
          ⚠️ نه چیپ: نُه زبان دو سطرِ چیپ می‌شد و منو را شلوغ می‌کرد. در
          بازشونده هم انتخابِ فعلی دیده می‌شود و هم نامِ هر زبان **به خطِ
          خودش** (R-I18N-12) — چیزی که کدِ دوحرفی نمی‌رساند.
        */}
        <div className="px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="um-locale" className="text-sm text-muted-foreground">
              {t("زبان")}
            </label>
            <select
              id="um-locale"
              value={locale}
              onChange={(e) => onLocaleChange(e.target.value as Locale)}
              className="h-7 rounded-md border bg-background px-2 text-xs"
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_NAMES[code]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ظاهر — کلیک، حالتِ بعدی را می‌گذارد */}
        <div className="px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t("ظاهر")}</span>
            <button
              type="button"
              onClick={() => setTheme(THEME_NEXT[theme])}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-muted"
            >
              <ThemeIcon className="size-3.5" />
              <span>{THEME_LABEL[theme]}</span>
            </button>
          </div>
        </div>

        <DropdownMenuSeparator />

        {/*
          تنظیمات — تا وقتی صفحه‌اش ساخته نشده غیرفعال است.
          لینکِ مرده بدتر از دکمهٔ غیرفعال است.
        */}
        <DropdownMenuItem disabled>
          <Settings className="size-4" />
          <span>{t("تنظیمات")}</span>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={onLogout} variant="destructive">
          <LogOut className="size-4" />
          <span>{t("خروج")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
