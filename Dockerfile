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

# مهاجرت داخلِ خودِ اپ اجرا می‌شود (src/instrumentation.ts) — فقط فایل‌های
# .sql لازم‌اند؛ درایور و migrator در باندلِ standalone حاضرند.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/src/db/migrations ./src/db/migrations

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# ⚠️ اپ با کاربرِ غیرروت اجرا می‌شود. اگر روزی از داخلِ اپ کدی اجرا شود،
# root نخواهد بود. کاربرِ `node` (uid 1000) در ایمیجِ رسمیِ Node هست.
#
# ⚠️ مالکیتِ این دو پوشه باید **پیش از** VOLUME ست شود: داکر والیومِ نام‌دار
# را با همان مالکیتی می‌سازد که مسیر در ایمیج دارد. اگر جا بیفتد، ساختِ
# رازها با Permission denied می‌شکند و اپ اصلاً بالا نمی‌آید.
#   /app/data        رازهای ساخته‌شده
#   /app/.next/cache کشِ بهینه‌سازیِ تصویرِ Next (فاکتور از next/image)
RUN mkdir -p /app/data /app/.next/cache  && chown -R node:node /app/data /app/.next

VOLUME ["/app/data"]
USER node

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
