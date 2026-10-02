import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ImageResponse } from 'next/og';
import {
  APPLE_ICON_SIZE, ICON_BACKGROUND, ICON_FOREGROUND, iconLetter, normalizeIconSize, type IconSize,
} from '@/domain/brand/icon';
import { companyLogoImage } from '@/server/files/service';
import { brandIdentity } from '@/server/setup/public-brand';

/**
 * آیکونِ برنامه — فاوآیکونِ تب و آیکونِ صفحهٔ اصلیِ گوشی (`?size=32|180|192|512`).
 *
 * ⚠️ بی‌ورود باز است، چون صفحهٔ ورود هم آیکون می‌خواهد. ولی R-FILE-01 سرِ جایش
 * است: این مسیر شناسه نمی‌گیرد، فقط لوگوی ثبت‌شده در «مشخصاتِ شرکت» را
 * می‌شناسد (همانی که صفحهٔ ورود هم نشان می‌دهد) و آن را **دوباره می‌سازد** —
 * PNG ِ تازه با sharp؛ فایلِ ذخیره‌شده عیناً بیرون نمی‌رود.
 *
 * بی‌لوگو: حرفِ اولِ نامِ برند روی رنگِ اصلی. فونتِ وزیرمتن (ضخیم، پروانهٔ OFL
 * در همان پوشه) همراهِ برنامه است چون ایمیجِ سرور هیچ فونتی ندارد و حرفِ فارسی
 * بی‌آن مربعِ خالی می‌شد.
 */

/*
 * ⚠️ فونت در `src/assets/fonts` است، نه از node_modules: ردیاب فایلِ بسته را در
 * مسیرِ درونیِ pnpm (`.pnpm/…`) می‌گذاشت و پیوندِ `node_modules/@fontsource`
 * در ایمیج نبود — آیکون فقط در تولید می‌شکست. مسیرها رشتهٔ **کامل و ثابت**اند
 * (نه ساخته‌شده از متغیر) تا ردیابِ Next همین دو فایل را ببیند.
 */
let fonts: Promise<Array<{ name: string; data: Buffer; weight: 700; style: 'normal' }>> | null = null;
/*
 * ⚠️ دو نامِ جدا: با یک نام برای هر دو زیرمجموعه فقط اولی به کار می‌رفت و
 * حرفِ لاتین با فونتِ پیش‌فرضِ کتابخانه (نازک) کشیده می‌شد. حرفی که در اولی
 * نیست از فونتِ بعدی برداشته می‌شود.
 * ⚠️ هر `readFile` با مسیرِ صریحِ خودش، نه از روی متغیر/حلقه: خواندن از متغیر
 * ردیاب را وامی‌داشت کلِ پروژه را در ایمیج بریزد.
 */
function loadFonts() {
  const style = { weight: 700 as const, style: 'normal' as const };
  fonts ??= Promise.all([
    readFile(path.join(process.cwd(), 'src/assets/fonts/vazirmatn-latin-700-normal.woff'))
      .then((data) => ({ name: 'Vazirmatn', data, ...style })),
    readFile(path.join(process.cwd(), 'src/assets/fonts/vazirmatn-arabic-700-normal.woff'))
      .then((data) => ({ name: 'Vazirmatn Arabic', data, ...style })),
  ]);
  return fonts;
}

async function fromLogo(logo: Buffer, size: IconSize): Promise<Buffer> {
  if (size === APPLE_ICON_SIZE) {
    // iOS پس‌زمینهٔ شفاف را سیاه می‌کند و گوشه‌ها را خودش گرد؛ لوگو روی سفید با حاشیه.
    const inner = Math.round(size * 0.8);
    const pad = Math.floor((size - inner) / 2);
    return sharp(logo)
      .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: '#ffffff' })
      .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: '#ffffff' })
      .png()
      .toBuffer();
  }
  return sharp(logo)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function fromLetter(name: string, size: IconSize): Promise<Response> {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: ICON_BACKGROUND,
          color: ICON_FOREGROUND,
          // آیکونِ آیفون را iOS خودش گرد می‌کند؛ بقیه گوشهٔ نرم مثلِ نشانِ سایدبار.
          borderRadius: size === APPLE_ICON_SIZE ? 0 : Math.round(size * 0.22),
          fontFamily: 'Vazirmatn',
          fontSize: Math.round(size * 0.62),
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {iconLetter(name)}
      </div>
    ),
    { width: size, height: size, fonts: await loadFonts() },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const size = normalizeIconSize(url.searchParams.get('size'));
  // نشانیِ نسخه‌دار (از پیوندِ صفحه) هرگز عوض نمی‌شود؛ بی‌نسخه (/favicon.ico) کوتاه کش شود.
  const cache = url.searchParams.has('v')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600';

  const logo = await companyLogoImage().catch(() => null);
  if (logo) {
    try {
      const png = await fromLogo(logo, size);
      return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': cache } });
    } catch {
      // قالبی که sharp نمی‌خواند (مثلاً HEIC) — به حرفِ اول برمی‌گردیم، نه خطا.
    }
  }

  const { name } = await brandIdentity();
  const image = await fromLetter(name, size);
  return new Response(image.body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': cache } });
}

export const dynamic = 'force-dynamic';
