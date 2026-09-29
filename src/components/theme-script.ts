import {
  isPalette, isTheme, PALETTE_STORAGE_KEY, THEME_STORAGE_KEY,
  type Palette, type ThemePreference,
} from '@/domain/people/appearance';

/**
 * اسکریپتِ پیش از رندر — تا صفحه با رنگِ اشتباه چشمک نزند.
 *
 * ⚠️ در فایلِ جدا، نه کنارِ ThemeProvider: آن فایل `'use client'` است و تابعِ
 * صادرشده از آن در سرور فقط «ارجاعِ کلاینت» است — فراخوانیِ آن در چیدمانِ ریشه
 * خطای «Attempted to call themeScript() from the server» می‌داد.
 *
 * ⚠️ **پالت هم** همین‌جا می‌نشیند، نه فقط روشن/تیره: بدونِ آن صفحه یک لحظه با
 * پالتِ پیش‌فرض ظاهر می‌شود و بعد می‌پرد.
 *
 * ترجیحِ ذخیره‌شده روی کاربر (مهاجرتِ 0033) اول می‌آید و در مرورگر هم نوشته
 * می‌شود، تا صفحهٔ ورود پس از خروج همان ظاهر را نگه دارد. مقدارها دوباره
 * اعتبارسنجی می‌شوند، پس جز فهرستِ شناخته‌شده چیزی در اسکریپت نمی‌نشیند.
 *
 * ⚠️ هر دسترسی به localStorage جدا گارد دارد: در حالتِ خصوصیِ مرورگر خطا
 * می‌دهد و ترجیحِ سرور نباید به‌خاطرِ آن اعمال‌نشده بماند.
 */
export function themeScript(server?: { theme: ThemePreference | ''; palette: Palette | '' }): string {
  const st = JSON.stringify(isTheme(server?.theme) ? server!.theme : '');
  const sp = JSON.stringify(isPalette(server?.palette) ? server!.palette : '');
  return `(function(){var st=${st},sp=${sp};`
    + `function g(k){try{return localStorage.getItem(k)}catch(e){return null}}`
    + `try{if(st)localStorage.setItem('${THEME_STORAGE_KEY}',st);if(sp)localStorage.setItem('${PALETTE_STORAGE_KEY}',sp);}catch(e){}`
    + `try{var t=st||g('${THEME_STORAGE_KEY}')||'system';`
    + `var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);`
    + `document.documentElement.classList.toggle('dark',d);`
    + `var p=sp||g('${PALETTE_STORAGE_KEY}');`
    + `if(p)document.documentElement.setAttribute('data-palette',p);`
    + `}catch(e){}})()`;
}
