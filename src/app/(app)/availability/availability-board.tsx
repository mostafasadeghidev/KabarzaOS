'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarDays, LayoutGrid, Table2, Timer, Users } from 'lucide-react';
import { formatSlots, WEEKDAYS, type Slot } from '@/domain/availability/weekly';
import type { CellState } from '@/domain/availability/team';
import type { PresenceState } from '@/domain/people/presence';
import { PRESENCE_LABELS } from '@/domain/people/presence';
import { PresenceDot } from '@/components/presence';
import { Thumb } from '@/components/thumb';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { useT } from '@/i18n/client';

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

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

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

function PersonName({ row }: { row: BoardRow }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {/* ⚠️ حضورِ خاموش ← بی‌نقطه، نه نقطهٔ خاکستریِ گمراه‌کننده. */}
      {row.presence && <PresenceDot state={row.presence} />}
      <Thumb id={row.id} title={row.name} fileId={row.avatarFileId} size={22} className="rounded-full" />
      {/* ⚠️ /members/{id} وجود ندارد؛ پروفایلِ عضو در گزارش‌هاست — همان لینکِ کارتِ افراد. */}
      <Link href={`/reports/member/${row.id}`} className="hover:underline">{row.name}</Link>
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
      <div className="flex flex-wrap gap-2">
        <Stat label={t("عضو")} value={props.summary.total} />
        <Stat label={t("برنامه‌دار")} value={props.summary.withSchedule} />
        <Stat label={t("در دسترسِ الان")} value={props.summary.availableNow} accent />
      </div>

      {/* ── تعویضِ نما ── */}
      <div className="flex gap-1">
        <ViewLink href="/availability" active={props.view === 'matrix'} icon="matrix" label={t("ماتریس")} />
        <ViewLink href="/availability?view=board" active={props.view === 'board'} icon="board" label={t("بُرد")} />
      </div>

      {props.view === 'board' ? (
        <BoardColumns {...props} rows={shown} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr('جستجوی نام عضو…')}
              className="h-8 w-48"
            />
            {props.offices.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-muted-foreground">{t("دفتر:")}</span>
                {props.offices.map((o) => {
                  const on = offices.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setOffices((prev) => (on ? prev.filter((x) => x !== o.id) : [...prev, o.id]))}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${on ? 'border-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {o.name}
                    </button>
                  );
                })}
              </div>
            )}
            {props.roles.length > 0 && (
              <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">{t("همهٔ نقش‌ها")}</option>
                {props.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={nowOnly}
                onChange={(e) => setNowOnly(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              {tr("فقط در دسترسِ الان")}
            </label>
          </div>

          {shown.length === 0 ? (
            <EmptyState title={t("موردی با این فیلترها پیدا نشد.")} />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="p-2 text-start font-normal">{t("عضو")}</th>
                    {props.order.map((d) => (
                      <th
                        key={d}
                        className={`p-2 text-start font-normal ${
                          d === props.todayIdx ? 'bg-primary/10 font-medium text-foreground' : ''
                        }`}
                      >
                        {tr(WEEKDAYS[d] ?? '')}
                        {d === props.todayIdx && (
                          <span className="ms-1 rounded bg-primary/20 px-1 text-[10px]">{tr("امروز")}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="p-2">
                        <PersonName row={row} />
                        {row.roleNames.length > 0 && (
                          <span className="ms-1 inline-flex gap-1">
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
                      </td>
                      {row.cells.map((cell, i) => (
                        <td
                          key={i}
                          title={cell.tip || undefined}
                          className={`p-2 text-xs whitespace-nowrap ${
                            cell.isToday ? 'bg-primary/5' : ''
                          }`}
                        >
                          {cell.state === 'leave' ? (
                            <span className="text-amber-600 dark:text-amber-500">
                              🌴 {tr("مرخصی")}
                              {cell.span && <span className="num"> {tr("تا")} {cell.span}</span>}
                            </span>
                          ) : cell.state === 'avail' ? (
                            <span className="num">{cell.span === 'تمام روز' ? tr('تمام روز') : cell.span}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── پنل‌های کناری ── */}
      <div className="grid gap-3 @3xl/main:grid-cols-2">
        <Panel icon={<CalendarDays className="size-4" />} title={t("مرخصیِ امروز")}>
          {props.away.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("امروز کسی مرخصی نیست.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {props.away.map((a) => (
                <li key={a.id} className="flex items-center gap-1.5">
                  <span>🌴</span>
                  <span>{a.name}</span>
                  {a.until && (
                    <span className="num text-xs text-muted-foreground">{tr("تا")} {a.until}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={<Timer className="size-4" />} title={t("تایمرهای در حالِ اجرا")}>
          {props.running.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("الان کسی تایمر روشن ندارد.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {props.running.map((r) => (
                <li key={r.userId} className="flex flex-wrap items-center gap-1.5">
                  <span>{r.name}</span>
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
            <p className="text-xs text-muted-foreground">{t("کسی آنلاین نیست.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {props.online.map((o) => (
                <li key={o.id} className="flex items-center gap-1.5">
                  <PresenceDot state={o.state} />
                  <span>{o.name}</span>
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
            <p className="text-xs text-muted-foreground">{t("همه برنامه‌شان را ثبت کرده‌اند.")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {props.none.map((n) => <li key={n.id}>{n.name}</li>)}
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
      className={`rounded-md border px-3 py-1.5 text-sm ${
        accent ? 'border-primary/40 bg-primary/5' : ''
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
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
        active ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      {icon === 'matrix' ? <Table2 className="size-4" /> : <LayoutGrid className="size-4" />}
      {label}
    </Link>
  );
}

function Panel({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 rounded-md border p-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">{icon}{title}</h2>
      {children}
    </section>
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
  return (
    <div className="grid gap-2 @2xl/main:grid-cols-4 @5xl/main:grid-cols-7">
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
            className={`grid content-start gap-1.5 rounded-md border p-2 ${
              isToday ? 'border-primary/40 bg-primary/5' : ''
            }`}
          >
            <h3 className="flex items-center justify-between text-xs font-medium">
              <span>
                {tr(WEEKDAYS[d] ?? '')}
                {isToday && <span className="ms-1 text-[10px] text-primary">{tr("امروز")}</span>}
              </span>
              <span className="num text-muted-foreground">{people.length}</span>
            </h3>
            {people.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{tr("کسی در دسترس نیست")}</p>
            ) : (
              <ul className="grid gap-1">
                {people.map((p) => (
                  <li key={p.id} className="text-xs">
                    <PersonName row={p} />
                    <span className="num ms-1 text-muted-foreground">
                      {formatSlots(p.days[d] ?? [], tr)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
