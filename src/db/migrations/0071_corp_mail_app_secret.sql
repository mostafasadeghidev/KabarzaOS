-- اتصالِ صندوقِ ایمیلِ شرکتی به برنامه (۲.۶۲.۰): app password ِ هر کارمند،
-- رمزگذاری‌شده با secret-box. فقط سرور می‌خواندش؛ هرگز به مرورگر نمی‌رود.
ALTER TABLE "service_grants" ADD COLUMN "app_secret_enc" text DEFAULT '' NOT NULL;
