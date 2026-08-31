-- وضعیت‌های پایهٔ پروژه: کامل‌کردن و محافظت — پورتِ `Core\Activator`.
--
-- ⚠️ سه وضعیت غایب بود و هر سه معنادارند: «در حال بررسی»، «متوقف» و
-- «لغو شده». دو تای آخر پایهٔ «پروژهٔ منجمد»اند،
-- پس بدونِ آنها آن قاعده هیچ‌وقت فعال نمی‌شد — منطق بود، داده نبود.
--
-- ⚠️ `on conflict` نداریم چون کلیدِ یکتایی روی نام نیست؛ به‌جایش فقط وقتی
-- درج می‌کنیم که گروه از قبل نباشد. اجرای دوباره چیزی اضافه نمی‌کند.
insert into tags (name, type, color, status_group, sort_order, is_protected)
select v.name, 'project_status', v.color, v.grp, v.sort, true
from (values
  ('در حال بررسی', '#eb8b05', 'in_progress', 5),
  ('متوقف',        '#b4cac9', 'on_hold',     6),
  ('لغو شده',      '#9b9b9b', 'cancelled',   7)
) as v(name, color, grp, sort)
where not exists (
  select 1 from tags t
  where t.type = 'project_status' and t.status_group = v.grp
);

-- ⚠️ وضعیتِ پایه حتی وقتی روی هیچ پروژه‌ای نیست هم حذف نمی‌شود: منطقِ
-- داشبورد و گزارش‌ها به گروه‌ها تکیه دارد، نه به وجودِ پروژه.
-- نسخهٔ قبلی دقیقاً همین هفت‌تا را `is_protected = 1` می‌گذارد و بقیه را نه.
update tags
   set is_protected = true
 where type = 'project_status'
   and status_group in
       ('not_started', 'lead', 'in_progress', 'completed', 'on_hold', 'cancelled');
