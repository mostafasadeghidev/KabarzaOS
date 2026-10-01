# KabarzaOS — ایمیجِ تولید (Next.js standalone + مهاجرتِ خودکار)
#
# ⚠️ چرا سه مرحله: وابستگی‌ها فقط با تغییرِ lockfile دوباره نصب می‌شوند؛
# سورس جدا build می‌شود؛ و ایمیجِ نهایی فقط خروجیِ standalone را دارد
# (نه node_modules ِ کامل، نه سورس) — حدودِ ۲۰۰MB به‌جای ۱.5GB.

FROM node:22-slim AS deps
WORKDIR /app
# ⚠️ slim، نه alpine: openssl ِ musl روی بعضی میزبان‌ها (WSL2 همین ماشین)
# با ERR_SSL_CIPHER_OPERATION_FAILED می‌شکند و sharp هم باینریِ glibc دارد.
# نصبِ مستقیمِ pnpm به‌جای corepack — بدونِ وابستگی به دانلودِ امضا.
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ⚠️ برای build به دیتابیس نیازی نیست — همهٔ صفحه‌ها dynamic اند.
RUN pnpm build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# ابزارهای پشتیبان‌گیری و بازگردانی (src/server/backup، scripts/kbz-backup.mjs):
#   pg_dump / pg_restore  — نسخهٔ ۱۷، هم‌خوان با دیتابیس (از مخزنِ رسمیِ PostgreSQL)
#   rclone                — ارسال به هر مقصد (S3، SFTP، WebDAV، Drive، Dropbox، …)
#   tar / gzip            — بسته‌بندیِ پشتیبان
#
# ⚠️ rclone نسخهٔ قفل‌شده با اثرانگشتِ SHA256 ِ رسمی است، نه «آخرین نسخه»:
# فایلِ دانلودشده‌ای که با این اثرانگشت جور نباشد، ساختِ ایمیج را متوقف می‌کند.
ARG RCLONE_VERSION=1.75.1
# همهٔ مقصدها از متغیرهای RCLONE_CONFIG_* ساخته می‌شوند و فایلِ پیکربندی نداریم؛
# «/notfound» نامِ مستندِ rclone برای «بی‌فایل» است و هشدارِ «config not found» را خاموش می‌کند.
ENV RCLONE_CONFIG=/notfound
ARG RCLONE_SHA256_AMD64=982b5aa772841168f8e380f139e9e787b2a105403e32b94da8676a0e1c0a13ab
ARG RCLONE_SHA256_ARM64=03f2504174034b6d004152ed7369251c9a9ec1f7e0836eda420f5c7a5ec0dff9
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates curl gnupg unzip gzip; \
  install -d /usr/share/postgresql-common/pgdg; \
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc; \
  . /etc/os-release; \
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list; \
  apt-get update; \
  apt-get install -y --no-install-recommends postgresql-client-17; \
  arch="$(dpkg --print-architecture)"; \
  case "$arch" in \
    amd64) sum="$RCLONE_SHA256_AMD64" ;; \
    arm64) sum="$RCLONE_SHA256_ARM64" ;; \
    *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
  esac; \
  curl -fsSL -o /tmp/rclone.zip "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-${arch}.zip"; \
  echo "${sum}  /tmp/rclone.zip" | sha256sum -c -; \
  unzip -q /tmp/rclone.zip -d /tmp; \
  install -m 0755 "/tmp/rclone-v${RCLONE_VERSION}-linux-${arch}/rclone" /usr/local/bin/rclone; \
  rm -rf /tmp/rclone*; \
  apt-get purge -y --auto-remove curl gnupg unzip; \
  rm -rf /var/lib/apt/lists/*; \
  pg_dump --version; rclone version | head -1

# مهاجرت داخلِ خودِ اپ اجرا می‌شود (src/instrumentation.ts) — فقط فایل‌های
# .sql لازم‌اند؛ درایور و migrator در باندلِ standalone حاضرند.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/src/db/migrations ./src/db/migrations
# ابزارِ بی‌وابستگیِ پشتیبان و بازگردانی — بیرون از باندل تا وقتی اپ بالا نمی‌آید هم کار کند.
COPY --from=build /app/scripts/kbz-backup.mjs ./scripts/kbz-backup.mjs

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# ⚠️ اپ با کاربرِ غیرروت اجرا می‌شود. اگر روزی از داخلِ اپ کدی اجرا شود،
# root نخواهد بود. کاربرِ `node` (uid 1000) در ایمیجِ رسمیِ Node هست.
#
# ⚠️ مالکیتِ این دو پوشه باید **پیش از** VOLUME ست شود: داکر والیومِ نام‌دار
# را با همان مالکیتی می‌سازد که مسیر در ایمیج دارد. اگر جا بیفتد، ساختِ
# رازها با Permission denied می‌شکند و اپ اصلاً بالا نمی‌آید.
#   /app/data        رازهای ساخته‌شده
#   /app/backups     فایل‌های پشتیبانِ روی خودِ سرور (والیومِ جدا از رازها)
#   /app/.next/cache کشِ بهینه‌سازیِ تصویرِ Next (فاکتور از next/image)
RUN mkdir -p /app/data /app/backups /app/.next/cache  && chown -R node:node /app/data /app/backups /app/.next

VOLUME ["/app/data", "/app/backups"]
USER node

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
