'use client';

import { UserName } from '@/components/user-avatar';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarDays, LayoutGrid, Table2, Timer, TreePalm, Users } from 'lucide-react';
import { ALL_DAY_SPAN, WEEKDAYS, type Slot } from '@/domain/availability/weekly';
import type { CellState } from '@/domain/availability/team';
import type { PresenceState } from '@/domain/people/presence';
import { PRESENCE_LABELS } from '@/domain/people/presence';
import { PresenceDot } from '@/components/presence';
import { agoLabel } from '@/domain/people/last-online';
import { Thumb } from '@/components/thumb';
import { EmptyState } from '@/components/ui/empty-state';
import { useT } from '@/i18n/client';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Toggle } from '@/components/ui/toggle';
import { buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchInput } from '@/components/ui/search-input';
import { Panel } from '@/components/page-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Hint } from '@/components/ui/tooltip';

interface Cell {
  state: CellState;
  isToday: boolean;
  span: string;
  tip: string;
}

export interface BoardRow {
  id: number;
  name: string;
  presence: PresenceState | null;
  /** «آخرین حضور» (۲.۶۴.۰). */
  lastOnlineAt: string | null;
  avatarFileId: number | null;
  hasSchedule: boolean;
  availableNow: boolean;
  onLeave: boolean;
  leaveUntil: string | null;
  officeIds: number[];
  roleTagIds: number[];
  roleNames: string[];
  days: Record<number, Slot[]>;
  cells: Cell[];
}

export interface BoardProps {
  view: 'matrix' | 'board';
  order: number[];
  todayIdx: number;
  rows: BoardRow[];
  summary: { total: number; withSchedule: number; availableNow: number };
  away: Array<{ id: number; name: string; until: string }>;
  running: Array<{ userId: number; name: string; project: string; duration: string }>;
  none: Array<{ id: number; name: string }>;
  online: Array<{ id: number; name: string; state: 'active' | 'idle'; seen: string }>;
  offices: Array<{ id: number; name: string }>;
  roles: Array<{ id: number; name: string }>;
}


/** «۳ دقیقه پیش» — بازهٔ درشت کافی است؛ ثانیه هر ثانیه کهنه می‌شود. */
function ago(
  iso: string,
  t: (s: string, v?: Record<string, string | number>) => string,
): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return t('همین حالا');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('{n} دقیقه پیش', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('{n} ساعت پیش', { n: hours });
  return t('{n} روز پیش', { n: Math.floor(hours / 24) });
}

function LastOnline({ at }: { at: string }) {
  const t = useT();
  return (
    <span className="text-xs text-muted-foreground" suppressHydrationWarning>
      · {t('آخرین حضور: {when}', { when: agoLabel(at, t) })}
    </span>
  );
}

function PersonName({ row, compact = false }: { row: BoardRow; compact?: boolean }) {
  const t = useT();
  const link = (
    <Link href={`/reports/member/${row.id}`} className={compact ? 'min-w-0 truncate font-medium hover:underline' : 'hover:underline'}>
      {row.name}
    </Link>
  );
  const away = row.presence === 'offline' && row.lastOnlineAt;
  return (
    <span className={compact ? 'flex min-w-0 items-center gap-1.5' : 'inline-flex items-center gap-1.5 whitespace-nowrap'}>
      {/* ⚠️ حضورِ خاموش ← بی‌نقطه، نه نقطهٔ خاکستریِ گمراه‌کننده. */}
      {row.presence && <PresenceDot state={row.presence} userId={row.id} />}
      <Thumb id={row.id} title={row.name} fileId={row.avatarFileId} person size={22} className="shrink-0 rounded-full" />
      {/* ⚠️ /members/{id} وجود ندارد؛ پروفایلِ عضو در گزارش‌هاست — همان لینکِ کارتِ افراد. */}
      {/* «آخرین حضور» (۲.۶۴.۰) — فقط برای آفلاین‌ها؛ در برد (فشرده) در راهنمای شناورِ نام، در ماتریس کنارِ نام. */}
      {compact && away ? (
        <Hint label={<span suppressHydrationWarning>{t('آخرین حضور: {when}', { when: agoLabel(row.lastOnlineAt!, t) })}</span>}>{link}</Hint>
      ) : link}
      {!compact && away && <LastOnline at={row.lastOnlineAt!} />}
    </span>
  );
}

/**
 * نمای تیمیِ «در دسترس بودن» — پورتِ `templates/admin/availability/page.php`.
 *
 * ⚠️ فیلترها سمتِ کلاینت‌اند، مثلِ نسخهٔ قبلی: کلِ تیم از قبل رندر شده و
 * فیلترکردن نباید رفت‌وبرگشتِ سرور بدهد.
 */
export function AvailabilityBoard(props: BoardProps) {
  const t = useT();
  const tr = useT();
  const [name, setName] = useState('');
  // پورتِ افزونه: فیلترِ دفتر **چندتایی** است.
  const [offices, setOffices] = useState<number[]>([]);
  const [role, setRole] = useState('');
  const [nowOnly, setNowOnly] = useState(false);

  const shown = useMemo(() => {
    const needle = name.trim().toLowerCase();
    return props.rows.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle)) return false;
      if (offices.length > 0 && !r.officeIds.some((id) => offices.includes(id))) return false;
      if (role && !r.roleTagIds.includes(Number(role))) return false;
      if (nowOnly && !r.availableNow) return false;
      return true;
    });
  }, [props.rows, name, offices, role, nowOnly]);

  return (
    <div className="grid gap-4">
      {/* ── نوارِ خلاصه ── */}
      <div className="flex flex-wrap gap-2" data-tour="availability-summary">
        <Stat label={t("عضو")} value={props.summary.total} />
        <Stat label={t("برنامه‌دار")} value={props.summary.withSchedule} />
        <Stat label={t("در دسترسِ الان")} value={props.summary.availableNow} accent />
      </div>

      {/* ── تعویضِ نما ── */}
      <div className="flex gap-1" data-tour="availability-view">
        <ViewLink href="/availability" active={props.view === 'matrix'} icon="matrix" label={t("ماتریس")} />
        <ViewLink href="/availability?view=board" active={props.view === 'board'} icon="board" label={t("بُرد")} />
      </div>

      {props.view === 'board' ? (
        <BoardColumns {...props} rows={shown} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" data-tour="availability-filters">
            <SearchInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr('جستجوی نام عضو…')}
            />
            {props.offices.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-muted-foreground">{t("دفتر:")}</span>
                {props.offices.map((o) => {
                  const on = offices.includes(o.id);
                  return (
                    <Toggle
                      key={o.id}
                      variant="outline"
                      size="sm"
                      pressed={on}
                      onPressedChange={() => setOffices((prev) => (on ? prev.filter((x) => x !== o.id) : [...prev, o.id]))}
                      className="h-7 rounded-full px-3 text-xs font-normal data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
                    >
                      {o.name}
                    </Toggle>
                  );
                })}
              </div>
            )}
            {props.roles.length > 0 && (
              <NativeSelect size="sm" value={role} onChange={(e) => setRole(e.target.value)}>
                <NativeSelectOption value="">{t("همهٔ نقش‌ها")}</NativeSelectOption>
                {props.roles.map((r) => <NativeSelectOption key={r.id} value={r.id}>{r.name}</NativeSelectOption>)}
              </NativeSelect>
            )}
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={nowOnly}
                onCheckedChange={(c) => setNowOnly(c === true)}
              />
              {tr("فقط در دسترسِ الان")}
            </label>
          </div>

          {shown.length === 0 ? (
            <EmptyState title={t("موردی با این فیلترها پیدا نشد.")} />
          ) : (
            // ⚠️ همان جدولِ مشترک (قاب، سرستون، فاصله) — پیش از این جدولِ خامِ
            // خودش را با خانه‌های p-2 و سرستونِ کم‌رنگ‌تر داشت.
            // ۳.۱۵.۱ — جدولِ شبکه‌ای: روزها می‌لغزند، نامِ عضو ثابت می‌ماند.
            <Table stickyFirst data-tour="availability-matrix">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("عضو")}</TableHead>
                  {props.order.map((d) => (
                    <TableHead
                      key={d}
                      data-today={d === props.todayIdx || undefined}
                      className={d === props.todayIdx ? 'bg-primary/10 text-foreground' : undefined}
                    >
                      {tr(WEEKDAYS[d] ?? '')}
                      {/* ⚠️ فاصلهٔ واقعی: بی آن «ه» ِ آخرِ روز به «ا» ِ «امروز» می‌چسبید. */}
                      {d === props.todayIdx && (
                        <>{' '}<span className="ms-1 rounded bg-primary/20 px-1 text-[10px]">{tr("امروز")}</span></>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => (
                  <TableRow key={row.id}>
                    {/*
                      ⚠️ گوشی (۳.۱۷.۲): ستونِ ثابتِ نام باریک — نامِ کوتاه‌شده و «آخرین حضور» در راهنمای شناور؛
                      نقش‌ها فقط از md. پیش از این نام و نقش و «آخرین حضور» بیش از نیمِ صفحه را می‌گرفتند و
                      فقط یک روز دیده می‌شد.
                    */}
                    <TableCell className="max-md:max-w-[8.5rem]">
                      <span className="md:hidden"><PersonName row={row} compact /></span>
                      <span className="hidden md:inline"><PersonName row={row} /></span>
                      {row.roleNames.length > 0 && (
                        <span className="ms-1 hidden gap-1 md:inline-flex">
                          {row.roleNames.map((n) => (
                            <span key={n} className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                              {n}
                            </span>
                          ))}
                        </span>
                      )}
                      {/* ⚠️ «برنامه نداده» با «هیچ روزی آزاد نیست» فرق دارد. */}
                      {!row.hasSchedule && (
                        <span className="ms-2 text-xs text-muted-foreground">{t("برنامه نداده")}</span>
                      )}
                    </TableCell>
                    {row.cells.map((cell, i) => (
                      <Hint key={i} label={cell.tip || undefined}>
                      <TableCell
                        data-today={cell.isToday || undefined}
                        className={`text-xs whitespace-nowrap ${cell.isToday ? 'bg-primary/5' : ''}`}
                      >
                        {cell.state === 'leave' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-500">
                            <TreePalm className="size-3.5 shrink-0" aria-hidden />
                            {tr("مرخصی")}
                            {cell.span && <> {tr("تا")} <span className="num">{cell.span}</span></>}
                          </span>
                        ) : cell.state === 'avail' ? (
                          (cell.span === ALL_DAY_SPAN ? tr('تمام روز') : <span className="num">{cell.span}</span>)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      </Hint>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {/* ── پنل‌های کناری ── */}
      <div className="grid gap-3 @3xl/main:grid-cols-2" data-tour="availability-panels">
        <Panel icon={<CalendarDays className="size-4" />} title={t("مرخصیِ امروز")}>
          {props.away.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("امروز کسی مرخصی نیست.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {props.away.map((a) => (
                <li key={a.id} className="flex items-center gap-1.5">
                  <TreePalm className="size-3.5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
                  <UserName userId={a.id} name={a.name} />
                  {a.until && (
                    <span className="text-xs text-muted-foreground">{tr("تا")} <span className="num">{a.until}</span></span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={<Timer className="size-4" />} title={t("تایمرهای در حالِ اجرا")}>
          {props.running.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("الان کسی تایمر روشن ندارد.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {props.running.map((r) => (
                <li key={r.userId} className="flex flex-wrap items-center gap-1.5">
                  <UserName userId={r.userId} name={r.name} />
                  {/* ⚠️ تایمرِ بدونِ پروژه هم کار است — «ساعتِ عمومی». */}
                  <span className="text-xs text-muted-foreground">
                    {r.project || tr('بدونِ پروژه')}
                  </span>
                  <span className="num ms-auto text-xs">{r.duration}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={<Users className="size-4" />} title={t("آنلاین اکنون")}>
          {props.online.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("کسی آنلاین نیست.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {props.online.map((o) => (
                <li key={o.id} className="flex items-center gap-1.5">
                  {/* نقطه همان نشانِ آواتار است (۲.۳۲.۰)؛ نقطهٔ جدا تکراری بود. */}
                  <UserName userId={o.id} name={o.name} />
                  <span className="ms-auto text-xs text-muted-foreground">
                    {tr(PRESENCE_LABELS[o.state])} · {ago(o.seen, tr)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={<CalendarDays className="size-4" />} title={t("بدونِ برنامه")}>
          {props.none.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("همه برنامه‌شان را ثبت کرده‌اند.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {props.none.map((n) => <li key={n.id}><UserName userId={n.id} name={n.name} /></li>)}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <span
      className={`rounded-lg border px-3 py-1.5 text-sm ${
        accent ? 'border-primary/40 bg-[color-mix(in_oklab,var(--color-primary)_6%,var(--color-card))]' : 'bg-card'
      }`}
    >
      <b className="num">{value}</b> <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function ViewLink({
  href, active, icon, label,
}: { href: string; active: boolean; icon: 'matrix' | 'board'; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      // ⚠️ پیوند می‌ماند، نه ToggleGroup: نما در آدرس است تا قابلِ اشتراک باشد.
      className={buttonVariants({ variant: active ? 'secondary' : 'ghost', size: 'sm' })}
    >
      {icon === 'matrix' ? <Table2 className="size-4" /> : <LayoutGrid className="size-4" />}
      {label}
    </Link>
  );
}

/**
 * نمای بُرد — یک ستون به‌ازای هر روز، با فهرستِ افرادِ آن روز.
 *
 * ⚠️ در ستونِ **امروز**، افرادِ مرخصی حذف می‌شوند؛ بقیهٔ روزها دست‌نخورده‌اند.
 * همان قاعدهٔ خانهٔ ماتریس، اینجا در شکلِ دیگر.
 */
function BoardColumns({ order, todayIdx, rows }: BoardProps) {
  const tr = useT();
  /**
   * ۳.۱۷.۲ — گوشی: یک روز در هر لحظه با ردیفِ روزها (پیش‌فرض امروز)، نه هفت کارتِ بلندِ زیرِ هم.
   * از md به بالا همهٔ روزها کنارِ هم می‌مانند.
   */
  const [day, setDay] = useState<number>(todayIdx ?? order[0] ?? 0);
  const peopleOf = (d: number) => rows.filter((r) => r.days[d] !== undefined && !(d === todayIdx && r.onLeave));
  return (
    <>
    <div role="tablist" aria-label={tr('روز')} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
      {order.map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          aria-selected={day === d}
          onClick={() => setDay(d)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${day === d ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'}`}
        >
          {tr(WEEKDAYS[d] ?? '')}
          {d === todayIdx && day !== d && <span aria-hidden className="size-1.5 rounded-full bg-primary" />}
          <span className={`num ${day === d ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{peopleOf(d).length}</span>
        </button>
      ))}
    </div>

    {/*
      ⚠️ ۳.۱۵.۲ — ستون‌ها با کمینهٔ ۱۳rem، نه هفت ستونِ ثابت: در عرضِ معمولی هر روز ~۱۸۰ پیکسل می‌شد و
      نام، «آخرین حضور» و بازه‌ها از کادر بیرون می‌زدند. حالا هر چند روز که جا شود کنارِ هم است.
    */}
    <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2" data-tour="availability-board-days">
      {order.map((d) => {
        const isToday = d === todayIdx;
        const people = rows.filter((r) => {
          if (r.days[d] === undefined) return false;
          if (isToday && r.onLeave) return false;
          return true;
        });
        return (
          <div
            key={d}
            data-today-col={isToday || undefined}
            className={`grid content-start gap-1.5 rounded-lg border p-2 ${d !== day ? 'max-md:hidden' : ''} ${
              isToday ? 'border-primary/40 bg-[color-mix(in_oklab,var(--color-primary)_6%,var(--color-card))]' : 'bg-card'
            }`}
          >
            <h3 className="flex items-center justify-between text-xs font-medium">
              <span>
                {tr(WEEKDAYS[d] ?? '')}
                {isToday && <>{' '}<span className="ms-1 text-[10px] text-primary">{tr("امروز")}</span></>}
              </span>
              <span className="num text-muted-foreground">{people.length}</span>
            </h3>
            {people.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{tr("کسی در دسترس نیست")}</p>
            ) : (
              /*
                ⚠️ ۳.۱۵.۲ — هر نفر دو خط: آواتار و نام، و زیرش بازه‌ها هر کدام برچسبِ چپ‌به‌راستِ جدا.
                پیش از این همه در یک خطِ بی‌شکست بود و «06:00–18:00» وسطِ متنِ فارسی جابه‌جا خوانده می‌شد.
                «آخرین حضور» به راهنمای شناورِ نام رفت.
              */
              <ul className="grid gap-2">
                {people.map((p) => {
                  const slots = p.days[d] ?? [];
                  return (
                    // ۳.۱۷.۲ — یک خط: نام یک سو، بازه‌ها سوی دیگر؛ اگر جا نشد بازه‌ها به خطِ بعد می‌روند.
                    <li key={p.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                      <span className="min-w-0 flex-1"><PersonName row={p} compact /></span>
                      <span className="flex flex-wrap justify-end gap-1">
                        {slots.length === 0 ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{tr('تمام روز')}</span>
                        ) : slots.map((s, i) => (
                          <span key={i} dir="ltr" className="num rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            {s.from}–{s.to}
                          </span>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}
