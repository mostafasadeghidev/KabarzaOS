-- وضعیت‌های «تکمیل‌شده» و «لغوشده» بسته‌اند، و سه کلیدِ یکتا که در اسکیما جا مانده بود.
--
-- ⚠️ چرا ۰۰۱۹ کافی نبود: ۰۰۱۹ ردیف‌های وضعیتِ خودش را با is_closed=true می‌کارد،
-- ولی روی دیتابیسی که ۰۰۱۵ از قبل ردیفِ بی‌اسلاگِ همان گروه را داشت، آن ردیف
-- را «می‌پذیرد» (اسلاگ می‌دهد) و ردیفِ خودش را نمی‌کارد — و ردیفِ پذیرفته‌شده
-- is_closed=false ِ ۰۰۱۵ را نگه می‌دارد. نتیجه: «لغو شده» پروژهٔ باز حساب می‌شد،
-- چون `isOpenProject()` دقیقاً روی همین ستون تصمیم می‌گیرد.
--
-- ⚠️ فقط ردیف‌هایی که هنوز غلط‌اند؛ تگی که مدیر خودش دست زده، دست نمی‌خورد.

UPDATE tags
   SET is_closed = true
 WHERE type = 'project_status'
   AND status_group IN ('completed', 'cancelled')
   AND is_closed = false;

-- رنگِ پیش‌فرضِ افزونه برای «متوقف» و «لغوشده» — فقط جایی که هنوز رنگِ ۰۰۱۵ را دارد.
UPDATE tags SET color = '#c7c7c7'
 WHERE type = 'project_status' AND status_group = 'on_hold' AND color = '#b4cac9';
UPDATE tags SET color = '#ff0000'
 WHERE type = 'project_status' AND status_group = 'cancelled' AND color = '#9b9b9b';

-- سه کلیدِ یکتایی که افزونه دارد و اسکیما نداشت: شرکت‌کنندهٔ گفتگو، شرکت‌کنندهٔ
-- جلسه، کاربرِ حساب. تکراری یعنی ردیف و شمارشِ نخواندهٔ دوبل، دعوت و اعلانِ دوبل.
-- ⚠️ اول تکراری‌ها حذف می‌شوند (قدیمی‌ترین می‌ماند)، بعد ایندکس ساخته می‌شود —
-- وگرنه ساختِ ایندکس روی دادهٔ موجود شکست می‌خورد.

DELETE FROM thread_users a
 USING thread_users b
 WHERE a.id > b.id AND a.thread_id = b.thread_id AND a.user_id = b.user_id;
CREATE UNIQUE INDEX IF NOT EXISTS thread_users_thread_user_uq
  ON thread_users (thread_id, user_id);

DELETE FROM meeting_attendees a
 USING meeting_attendees b
 WHERE a.id > b.id AND a.meeting_id = b.meeting_id AND a.user_id = b.user_id;
CREATE UNIQUE INDEX IF NOT EXISTS meeting_attendees_meeting_user_uq
  ON meeting_attendees (meeting_id, user_id);

DELETE FROM account_users a
 USING account_users b
 WHERE a.id > b.id AND a.account_id = b.account_id AND a.user_id = b.user_id;
CREATE UNIQUE INDEX IF NOT EXISTS account_users_account_user_uq
  ON account_users (account_id, user_id);
