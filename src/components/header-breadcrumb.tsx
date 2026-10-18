'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { usePageCrumb } from '@/components/page-crumb';
import { useNavStack } from '@/components/nav-history';
import { useT } from '@/i18n/client';

export interface CrumbPage {
  href: string;
  label: string;
}

/**
 * مسیرِ صفحه در نوارِ بالای محتوا — همان جایی که نمونهٔ سایدبارِ shadcn
 * «Building Your Application › Data Fetching» می‌گذارد.
 *
 * ⚠️ پیش از این فقط متنِ ثابتِ «KabarzaOS» بود؛ نامِ برند همین حالا در سرِ
 * سایدبار هست و تکرارش چیزی نمی‌گفت. مسیر می‌گوید کاربر کجاست:
 *   `/projects`      → «پروژه‌ها»
 *   `/projects/12`   → «پروژه‌ها › طراحی وب‌سایت»
 *   `/reports/hours/3` → «گزارش‌ها › ساعت کاری › نامِ عضو» (پیوندِ برگشتِ سرصفحه)
 *
 * بخشِ اول از **فهرستِ منو** می‌آید (همان فیلترِ مجوزیِ سرور)، و بقیه از
 * `PageHeader` ِ صفحه (از راهِ `PageCrumb`). صفحهٔ سطحِ اول فقط نامِ بخش را
 * دارد، حتی اگر عنوانِ سرصفحه‌اش چیزِ دیگری باشد («سلام، مصطفی»).
 *
 * ⚠️ روی موبایل فقط تکهٔ آخر دیده می‌شود و بریده می‌شود؛ نوارِ ۴۸ پیکسلی
 * جای سه تکه را ندارد.
 */
export function HeaderBreadcrumb({ pages }: { pages: CrumbPage[] }) {
  const tr = useT();
  const pathname = usePathname();
  const crumb = usePageCrumb();

  const section = pages
    .filter((p) => pathname === p.href || pathname.startsWith(`${p.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const crumbs: Array<{ href?: string; label: string }> = [];
  // ⚠️ برچسبِ منو کلیدِ ترجمه است (`NAV` ِ چیدمان در بارِ ماژول ساخته می‌شود، نه هر درخواست)؛ همان کاری که سایدبار می‌کند.
  if (section) crumbs.push({ href: section.href, label: tr(section.label) });

  const deeper = section ? pathname !== section.href : true;
  const trail = useTrail(pages, pathname);
  if (trail && crumb && deeper) {
    /**
     * ⚠️ مسیرِ واقعیِ کاربر (۲.۳۸.۰): از «گزارش‌ها ← علی» روی Adlib که زد،
     * «گزارش‌ها › علی › Adlib» — نه «پروژه‌ها › Adlib» که بخشِ ثابتِ آدرس
     * بود و کاربر را به جایی می‌برد که از آن نیامده بود.
     */
    crumbs.length = 0;
    for (const entry of trail) crumbs.push(entry);
    crumbs.push({ label: crumb.title });
  } else if (crumb && deeper) {
    const back = crumb.back;
    const backPath = back?.href.split('?')[0];
    if (back && backPath !== section?.href && backPath !== pathname) {
      crumbs.push({ href: back.href, label: back.label });
    }
    if (crumbs[crumbs.length - 1]?.label !== crumb.title) crumbs.push({ label: crumb.title });
  }

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb aria-label={tr('مسیرِ صفحه')} className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={`${c.href ?? ''}|${c.label}`}>
              {i > 0 && <BreadcrumbSeparator className="hidden sm:block" />}
              <BreadcrumbItem className={last ? 'min-w-0' : 'hidden sm:inline-flex'}>
                {last || !c.href ? (
                  <BreadcrumbPage className="block truncate">{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={c.href} prefetch={false}>{c.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** بیشترِ خانه‌ها پیش از صفحهٔ فعلی؛ بیشتر از این، وسطی‌ها «…» می‌شوند. */
const MAX_TRAIL = 3;

/**
 * راهی که کاربر در همین زبانه تا اینجا آمده — از آخرین صفحهٔ منو تا صفحهٔ
 * قبلی. `null` یعنی تاریخچه کمکی نمی‌کند (ورودِ مستقیم، رفرش بی‌پشته، یا
 * پشته‌ای که به صفحهٔ منو نمی‌رسد)؛ آن‌وقت همان «بخش › عنوان» ِ آدرس.
 */
function useTrail(pages: CrumbPage[], pathname: string): Array<{ href?: string; label: string }> | null {
  const tr = useT();
  const stack = useNavStack();
  if (!stack || stack.length < 2) return null;
  const top = stack[stack.length - 1]!;
  if (top.path !== pathname) return null;
  const menu = new Map(pages.map((p) => [p.href, p.label]));
  const out: Array<{ href?: string; label: string }> = [];
  for (let i = stack.length - 2; i >= 0; i -= 1) {
    const entry = stack[i]!;
    const menuLabel = menu.get(entry.path);
    if (menuLabel) {
      out.unshift({ href: entry.href, label: tr(menuLabel) });
      // فقط وقتی راه از صفحهٔ منوی **دیگری** آمده معنا دارد؛ وگرنه همان بخشِ آدرس کافی است.
      if (out.length === 1) return null;
      if (out.length > MAX_TRAIL) out.splice(1, out.length - MAX_TRAIL, { label: '…' });
      return out;
    }
    if (!entry.title) return null;
    out.unshift({ href: entry.href, label: entry.title });
    if (out.length > 8) return null;
  }
  return null;
}

