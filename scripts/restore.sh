#!/bin/sh
# بازگردانی از یک فایلِ پشتیبان — روی همین سرور یا سرورِ تازه.
#
#   ./scripts/restore.sh /path/to/kabarzaos-YYYY-MM-DD-HHMMSS.kbzbak
#
# ⚠️ دیتابیس و فایل‌های فعلی با محتوای پشتیبان **جایگزین** می‌شوند. ابزار پیش از
# هر تغییری خلاصهٔ پشتیبان را نشان می‌دهد و «yes» می‌خواهد.
#
# مراحل:
#   ۱. اپ و زمان‌بند متوقف می‌شوند (تا وسطِ کار چیزی ننویسند)
#   ۲. دیتابیس و انبارِ فایل روشن می‌شوند
#   ۳. پشتیبان با رمزش باز و دیتابیس، فایل‌ها و رازهای داخلی برگردانده می‌شوند
#   ۴. همه‌چیز دوباره بالا می‌آید
#
# رمزِ فایل در ترمینال پرسیده می‌شود (یا از متغیرِ KBZ_PASSPHRASE).
set -eu

if [ $# -lt 1 ] || [ ! -f "$1" ]; then
  echo "استفاده: ./scripts/restore.sh <فایلِ پشتیبان>" >&2
  exit 2
fi
FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
shift   # بقیهٔ آرگومان‌ها (مثلاً --yes) به ابزار می‌رسد
cd "$(dirname "$0")/.."

echo "▸ توقفِ اپ و زمان‌بند"
docker compose stop app cron 2>/dev/null || true

echo "▸ روشن‌کردنِ دیتابیس و انبارِ فایل"
docker compose up -d db storage

# ⚠️ -it فقط وقتی ترمینال داریم — در اجرای خودکار رمز از KBZ_PASSPHRASE می‌آید.
TTY_FLAG="-T"
[ -t 0 ] && TTY_FLAG=""
docker compose run --rm --no-deps $TTY_FLAG \
  -e KBZ_PASSPHRASE="${KBZ_PASSPHRASE:-}" \
  -v "$FILE:/restore/backup.kbzbak:ro" \
  app node scripts/kbz-backup.mjs restore /restore/backup.kbzbak "$@"

echo "▸ بالا آوردنِ همه‌چیز"
docker compose up -d
