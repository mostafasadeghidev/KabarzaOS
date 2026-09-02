import { createTranslator, type Translator } from '@/i18n/translate';
/**
 * گزارشِ روزانه — خلاصهٔ یک‌روزهٔ فعالیت برای کانالِ تیم.
 *
 * منبع: `Support\Daily_Report`.
 *
 * ⚠️ این گزارشِ **گروهی** است، نه اعلانِ شخصی؛ پس از فرستندهٔ اعلان‌ها جداست
 * و به وب‌هوکِ دیسکورد و/یا تلگرامِ مالک می‌رود.
 */

export const REPORT_SECTIONS = [
  { key: 'hours', icon: '🕒', label: 'ساعت کاری اعضا' },
  { key: 'incoming', icon: '📥', label: 'دریافتی‌ها از کارفرما' },
  { key: 'payouts', icon: '📤', label: 'پرداختی‌ها به اعضا' },
  { key: 'expenses', icon: '💸', label: 'هزینه‌های پروژه' },
  { key: 'tasks_done', icon: '✅', label: 'تسک‌های انجام‌شده' },
  { key: 'tasks_new', icon: '🆕', label: 'تسک‌های جدید' },
  { key: 'meetings', icon: '📅', label: 'جلسات' },
  { key: 'absences', icon: '🌴', label: 'مرخصی‌ها' },
] as const;

export type SectionKey = (typeof REPORT_SECTIONS)[number]['key'];

export interface ReportConfig {
  sections: string[];
  /** ساعتِ ارسال، `HH:MM`. */
  time: string;
  /** گزارشِ چند روزِ قبل؟ پیش‌فرض ۱ = دیروز. */
  offset: number;
  discord: boolean;
  webhook: string;
  telegram: boolean;
}

export const DEFAULT_CONFIG: ReportConfig = {
  sections: REPORT_SECTIONS.map((s) => s.key),
  time: '09:00',
  offset: 1,
  discord: false,
  webhook: '',
  telegram: false,
};

/**
 * آیا مقصدی برای فرستادن هست؟
 * ⚠️ بدونِ مقصد، ساختنِ گزارش کارِ بیهوده است — و بدتر، مهرِ «فرستاده شد»
 * می‌خورد و روزِ واقعیِ راه‌اندازی از دست می‌رود.
 */
/** بدونِ مترجم همان فارسیِ مبدأ — کلید خودِ متنِ فارسی است. */
const SOURCE: Translator = createTranslator({});

export function hasDestination(config: ReportConfig, botConfigured: boolean): boolean {
  return (config.discord && config.webhook.trim() !== '')
    || (config.telegram && botConfigured);
}

/**
 * دروازهٔ ارسال: مقصد هست، امروز نفرستاده‌ایم، و از ساعتِ مقرر گذشته.
 *
 * ⚠️ مقایسهٔ `HH:MM` رشته‌ای درست است چون هر دو صفرْپیشوند دارند؛ ولی
 * ساعتِ نامعتبر نباید گزارش را برای همیشه بخواباند — به پیش‌فرض برمی‌گردد.
 */
export function shouldSendNow(input: {
  config: ReportConfig;
  botConfigured: boolean;
  lastSentDate: string | null;
  localDate: string;
  localTime: string;
}): boolean {
  if (!hasDestination(input.config, input.botConfigured)) return false;
  if (input.lastSentDate === input.localDate) return false;

  const at = /^\d{2}:\d{2}$/.test(input.config.time) ? input.config.time : DEFAULT_CONFIG.time;
  return input.localTime >= at;
}

/** تاریخِ گزارش — `offset` روز قبل از امروز. */
export function reportDate(localDate: string, offset: number): string {
  const days = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 1;
  const at = new Date(`${localDate}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
}

export interface ReportSections {
  hours: string[];
  incoming: string[];
  payouts: string[];
  expenses: string[];
  tasks_done: string[];
  tasks_new: string[];
  meetings: string[];
  absences: string[];
}

/**
 * متنِ گزارش.
 *
 * ⚠️ بخشِ **فعالِ خالی** هم چاپ می‌شود، با «موردی ثبت نشده» — نه اینکه حذف
 * شود. سکوت دو معنا دارد (نبودِ داده یا خاموش‌بودنِ بخش) و خواننده باید
 * بداند کدام است.
 */
/**
 * ⚠️ `t` مترجمِ مقصد است: پیش از این گزارش فقط فارسی ساخته می‌شد، در حالی که
 * پیش‌نمایشش در تنظیمات ترجمه می‌شد — دو متن برای یک گزارش. بدونِ مترجم همان
 * فارسیِ مبدأ برمی‌گردد.
 */
export function buildReport(input: {
  date: string;
  sections: string[];
  data: ReportSections;
}, t: Translator = SOURCE): string {
  if (input.sections.length === 0) return '';

  const lines: string[] = [t('📊 گزارش روزانهٔ کبرزا — {date}', { date: input.date })];

  for (const section of REPORT_SECTIONS) {
    if (!input.sections.includes(section.key)) continue;
    const rows = input.data[section.key];
    lines.push('', `${section.icon} ${t(section.label)}:`);
    lines.push(...(rows.length > 0 ? rows : [t('• موردی ثبت نشده.')]));
  }

  return lines.join('\n');
}

/**
 * پیامِ دیسکورد سقفِ ۲۰۰۰ نویسه دارد.
 * ⚠️ بریدن باید **از انتها و با نشانه** باشد؛ پیامِ نیمه‌بریده‌ای که معلوم
 * نیست ادامه داشته، بدتر از پیامِ کوتاه است.
 */
export const DISCORD_LIMIT = 2000;

/** سقفِ تلگرام ۴۰۹۶ نویسه است؛ همان حاشیهٔ نسخهٔ قبلی. */
export const TELEGRAM_CHUNK = 3900;

/**
 * بریدنِ متن به تکه‌های حداکثر `max` نویسه‌ای روی مرزِ خط — پورتِ
 * `Daily_Report::chunk()`.
 *
 * ⚠️ بدونِ این، گزارشِ بلند به تلگرام **بی‌صدا** نمی‌رسید: API با ۴۰۰ رد
 * می‌کند و کرون خطا را می‌بلعد. خطِ تکیِ بلندتر از سقف هم سخت بریده می‌شود
 * تا هیچ حالتی حلقهٔ بی‌پایان یا تکهٔ بزرگ نسازد.
 */
export function chunkText(text: string, max = TELEGRAM_CHUNK): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let buf = '';
  for (const rawLine of text.split('\n')) {
    let line = rawLine;
    while (line.length > max) {
      if (buf !== '') { out.push(buf); buf = ''; }
      out.push(line.slice(0, max));
      line = line.slice(max);
    }
    if (buf !== '' && buf.length + line.length + 1 > max) {
      out.push(buf);
      buf = '';
    }
    buf += (buf === '' ? '' : '\n') + line;
  }
  if (buf !== '') out.push(buf);
  return out;
}

export function fitForDiscord(text: string): string {
  if (text.length <= DISCORD_LIMIT) return text;
  const suffix = '\n… (بریده شد)';
  return `${text.slice(0, DISCORD_LIMIT - suffix.length)}${suffix}`;
}

/** پورتِ `project_name`: بی‌پروژه → «بدون پروژه». */
export function projectLabel(title: string | null | undefined, t: Translator = SOURCE): string {
  return title && title !== '' ? title : t('بدون پروژه');
}

/** پورتِ `hours_lines`: «• نام: 0:30 وب‌سایت، 2:00 لوگو» — ریزِ هر پروژه، نه فقط جمع. */
export function hoursLine(
  name: string,
  parts: ReadonlyArray<{ minutes: number; project: string }>,
  label: (minutes: number) => string,
): string {
  return `• ${name}: ${parts.map((p) => `${label(p.minutes)} ${p.project}`).join('، ')}`;
}

/** پورتِ `payment_lines`: «• [عضو — ]پروژه: مبلغ ارز» — مبلغ در ارزِ خودِ ردیف. */
export function paymentLine(input: { member?: string | null; project: string; amount: string; code: string }): string {
  const who = input.member ? `${input.member} — ` : '';
  return `• ${who}${input.project}: ${input.amount}${input.code ? ` ${input.code}` : ''}`;
}

/** پورتِ `meeting_lines`: «• HH:MM — عنوان (پروژه)». */
export function meetingLine(input: { time: string; title: string; project?: string | null }): string {
  return `• ${input.time} — ${input.title}${input.project ? ` (${input.project})` : ''}`;
}

/** پورتِ `post_to_webhook`: دیسکورد تکه‌های ≤۱۹۰۰ نویسه می‌گیرد (زیرِ سقفِ ۲۰۰۰). */
export const DISCORD_CHUNK = 1900;

/**
 * پاک‌سازیِ پیکربندی هنگامِ ذخیره — پورتِ `Daily_Report::save`: ساعت باید `HH:MM`
 * باشد وگرنه ۰۹:۰۰؛ آفست در بازهٔ ۰..۷؛ بخش‌ها فقط کلیدهای شناخته؛ وب‌هوک فقط
 * نشانیِ http(s) — وگرنه خالی. پیش از این مقدارِ خراب ذخیره و فقط هنگامِ ارسال ترمیم می‌شد.
 */
export function normalizeReportConfig(input: Partial<ReportConfig>): ReportConfig {
  const known = new Set<string>(REPORT_SECTIONS.map((s) => s.key));
  const time = typeof input.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time.trim())
    ? input.time.trim()
    : DEFAULT_CONFIG.time;
  const offsetRaw = Number(input.offset);
  const offset = Number.isInteger(offsetRaw) ? Math.min(7, Math.max(0, offsetRaw)) : DEFAULT_CONFIG.offset;
  const webhookRaw = typeof input.webhook === 'string' ? input.webhook.trim() : '';
  const webhook = /^https?:\/\/\S+$/i.test(webhookRaw) ? webhookRaw : '';
  return {
    sections: (input.sections ?? []).filter((k) => known.has(k)),
    time,
    offset,
    discord: Boolean(input.discord),
    webhook,
    telegram: Boolean(input.telegram),
  };
}
