#!/usr/bin/env bash
# نصبِ KabarzaOS روی سرور — یک فرمان:  bash install.sh
#
# رازها را خودش می‌سازد و در .env.prod می‌گذارد (که در .gitignore است).
# اجرای دوباره امن است: اگر .env.prod باشد دست نمی‌خورد، فقط اپ به‌روز می‌شود.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── داکر ─────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "داکر نصب نیست. https://docs.docker.com/engine/install/"
if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else die "نسخهٔ قبلیِ compose نصب نیست."; fi
docker info >/dev/null 2>&1 || die "دیمنِ داکر بالا نیست (یا کاربر در گروهِ docker نیست)."

# ── راز ──────────────────────────────────────────────────────────────
# ⚠️ openssl همه‌جا نیست؛ /dev/urandom هست.
secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32
  else LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64; fi
}

if [ -f .env.prod ]; then
  say "· .env.prod از قبل هست — دست نمی‌خورد."
else
  say "▸ ساختِ .env.prod با رازهای تصادفی"
  # آدرسِ عمومی: تنها چیزی که ماشین نمی‌تواند حدس بزند.
  DOMAIN="${1:-}"
  if [ -z "$DOMAIN" ] && [ -t 0 ]; then
    printf '  دامنه (خالی = http://localhost:3000): '
    read -r DOMAIN || DOMAIN=""
  fi
  case "$DOMAIN" in
    "")            APP_URL="http://localhost:3000" ;;
    http://*|https://*) APP_URL="$DOMAIN" ;;
    *)             APP_URL="https://$DOMAIN" ;;
  esac

  # پورتِ آزاد: اگر ۳۰۰۰ اشغال باشد بی‌سروصدا بعدی را برمی‌داریم، تا کاربر
  # با «ports are not available» ِ داکر روبه‌رو نشود.
  # اتصالِ ناموفق یعنی کسی گوش نمی‌دهد، یعنی پورت آزاد است.
  PORT=3000
  for p in $(seq 3000 3020); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then PORT=$p; break; fi
  done
  [ "$PORT" = "3000" ] || say "· پورتِ ۳۰۰۰ اشغال بود — $PORT برداشته شد."
  case "$APP_URL" in
    http://localhost:3000) APP_URL="http://localhost:$PORT" ;;
  esac

  umask 077   # ⚠️ فایلِ راز نباید world-readable باشد
  cat > .env.prod <<ENV
# ساختهٔ install.sh — رازها یکتا و تصادفی‌اند. کامیتش نکن.
APP_URL=$APP_URL
APP_PORT=$PORT
# BIND=0.0.0.0   # بدونِ reverse proxy این را از کامنت دربیاور
APP_TIMEZONE=Asia/Tehran
DEFAULT_LOCALE=fa

# ⚠️ SESSION_SECRET و CRON_SECRET عمداً اینجا نیستند: خودِ کانتینر بارِ اول
# می‌سازدشان و در والیوم نگه می‌دارد (docker-entrypoint.sh). این‌طور
# استقرار با ابزارهای گرافیکی هم بدونِ تنظیمِ دستی کار می‌کند.
DB_PASSWORD=$(secret)
S3_ACCESS_KEY=kabarza
S3_SECRET_KEY=$(secret)
S3_BUCKET=kabarza
S3_REGION=us-east-1

# ── اختیاری ──────────────────────────────────────────────────────────
# بدونِ SMTP_HOST اعلانِ ایمیلی خاموش است (اپ سالم کار می‌کند).
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
# بدونِ توکن، کانالِ تلگرام و بنرِ اتصالش نمایش داده نمی‌شود.
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
ENV
  umask 022
fi

# ⚠️ compose برای جای‌گذاریِ ${DB_PASSWORD} در خطِ فرمان، .env می‌خواهد.
ln -sf .env.prod .env 2>/dev/null || cp -f .env.prod .env

say "▸ ساخت و بالاآوردن (بارِ اول چند دقیقه طول می‌کشد)"
if ! $DC up -d --build; then
  die "بالا نیامد. اگر خطا دربارهٔ پورت بود، در .env.prod مقدارِ APP_PORT را عوض کن و دوباره اجرا کن."
fi

say "▸ انتظار برای آماده‌شدن"
for i in $(seq 1 60); do
  # ⚠️ بدونِ xargs -r نوشته شده: آن پرچم GNU است و روی macOS نیست.
  CID=$($DC ps -q app 2>/dev/null || true)
  if [ -n "$CID" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$CID" 2>/dev/null)" = "healthy" ]; then
    URL=$(grep '^APP_URL=' .env.prod | cut -d= -f2-)
    printf '\n\033[32m✓ بالا آمد.\033[0m\n\n'
    printf '  %s را باز کن — ویزاردِ نصب حسابِ مدیرِ کل را می‌سازد.\n\n' "$URL"
    printf '  گزارش:  %s logs -f app\n' "$DC"
    printf '  خاموش:  %s down\n\n' "$DC"
    exit 0
  fi
  sleep 5
done

die "اپ در ۵ دقیقه سالم نشد. گزارش: $DC logs app"
