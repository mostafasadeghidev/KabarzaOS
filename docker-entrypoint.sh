#!/bin/sh
# رازها را اگر داده نشده باشند، بارِ اول خودمان می‌سازیم و در والیوم
# نگه می‌داریم.
#
# ⚠️ چرا اینجا و نه در compose: SESSION_SECRET باید هم **تصادفی** باشد و هم
# **بینِ راه‌اندازی‌ها ثابت**. پیش‌فرضِ ثابت در compose یعنی کلیدِ امضای
# نشست قابلِ حدس است (جعلِ نشست)؛ و ساختنش در هر بوت یعنی همه هر بار
# بیرون می‌افتند. فایلِ روی والیوم هر دو شرط را با هم دارد.
#
# ⚠️ متغیرِ محیطی همیشه اولویت دارد: اگر کاربر خودش ست کرده، دست نمی‌زنیم.
set -e

DIR="${SECRET_DIR:-/app/data}"
mkdir -p "$DIR"

random_hex() {
  # ۶۴ نویسهٔ هگز. بدونِ وابستگی به openssl که در ایمیجِ slim نیست.
  LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | head -c 64
}

ensure_secret() {
  name="$1"; file="$DIR/$2"
  eval "current=\${$name:-}"
  # کوتاه‌تر از ۳۲ هم یعنی «نداریم» — همان آستانه‌ای که خودِ اپ می‌سنجد.
  if [ -z "$current" ] || [ "${#current}" -lt 32 ]; then
    if [ ! -s "$file" ]; then
      random_hex > "$file"
      chmod 600 "$file"
      echo "[secrets] $name ساخته شد → $file"
    fi
    export "$name=$(cat "$file")"
  fi
}

ensure_secret SESSION_SECRET session_secret
ensure_secret CRON_SECRET   cron_secret

exec "$@"
