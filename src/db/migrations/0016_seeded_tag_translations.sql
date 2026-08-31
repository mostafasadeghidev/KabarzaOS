-- ترجمهٔ آمادهٔ تگ‌های پایه.
--
-- ⚠️ چرا لازم است: سازوکارِ `name_i18n` ساخته شد ولی تگ‌های seed با
-- `null` می‌آمدند، یعنی کاربرِ انگلیسی همچنان «شروع نشده» و «واریز»
-- می‌دید. نسخهٔ قبلی برای هر تگِ پایه ترجمهٔ آماده دارد و بدونِ آن، نیمی از
-- قابلیتِ چندزبانگی روی کاغذ می‌ماند.
--
-- ⚠️ تطبیق با `status_group` و `type` است، نه با **نام**: نام قابلِ ویرایش
-- است و ممکن است کاربر عوضش کرده باشد؛ گروه پایدار است.
--
-- ⚠️ فقط تگ‌هایی که هنوز ترجمه ندارند به‌روز می‌شوند — ترجمهٔ دستیِ کاربر
-- بازنویسی نمی‌شود.

-- وضعیتِ پروژه
update tags set name_i18n = '{"en":"Not started","de":"Nicht begonnen","ar":"لم يبدأ","ckb":"دەستپێنەکراوە","es":"Sin empezar","fr":"Non commencé","pt":"Por começar","tr":"Başlamadı"}'::jsonb
 where type = 'project_status' and status_group = 'not_started' and name_i18n is null;

update tags set name_i18n = '{"en":"Negotiating","de":"Vertragsverhandlung","ar":"قيد التفاوض","ckb":"دانوستان","es":"En negociación","fr":"En négociation","pt":"Em negociação","tr":"Görüşülüyor"}'::jsonb
 where type = 'project_status' and status_group = 'lead' and name_i18n is null;

update tags set name_i18n = '{"en":"In progress","de":"In Arbeit","ar":"قيد التنفيذ","ckb":"لە بەردەوامدایە","es":"En curso","fr":"En cours","pt":"Em curso","tr":"Devam ediyor"}'::jsonb
 where type = 'project_status' and status_group = 'in_progress' and name_i18n is null;

update tags set name_i18n = '{"en":"Completed","de":"Abgeschlossen","ar":"مكتمل","ckb":"تەواو بوو","es":"Completado","fr":"Terminé","pt":"Concluído","tr":"Tamamlandı"}'::jsonb
 where type = 'project_status' and status_group = 'completed' and name_i18n is null;

update tags set name_i18n = '{"en":"On hold","de":"Pausiert","ar":"معلّق","ckb":"ڕاگیراوە","es":"En pausa","fr":"En pause","pt":"Em pausa","tr":"Beklemede"}'::jsonb
 where type = 'project_status' and status_group = 'on_hold' and name_i18n is null;

update tags set name_i18n = '{"en":"Cancelled","de":"Storniert","ar":"ملغى","ckb":"هەڵوەشاوە","es":"Cancelado","fr":"Annulé","pt":"Cancelado","tr":"İptal edildi"}'::jsonb
 where type = 'project_status' and status_group = 'cancelled' and name_i18n is null;

-- وضعیتِ تسک
update tags set name_i18n = '{"en":"In progress","de":"In Arbeit","ar":"قيد التنفيذ","ckb":"لە بەردەوامدایە","es":"En curso","fr":"En cours","pt":"Em curso","tr":"Devam ediyor"}'::jsonb
 where type = 'task_status' and status_group = 'in_progress' and is_review = false and name_i18n is null;

update tags set name_i18n = '{"en":"Up for review","de":"Zur Prüfung","ar":"بانتظار المراجعة","ckb":"چاوەڕوانی پێداچوونەوە","es":"Para revisión","fr":"À relire","pt":"Para revisão","tr":"İnceleme bekliyor"}'::jsonb
 where type = 'task_status' and is_review = true and name_i18n is null;

update tags set name_i18n = '{"en":"Done","de":"Erledigt","ar":"تم","ckb":"کرا","es":"Hecho","fr":"Terminé","pt":"Concluído","tr":"Bitti"}'::jsonb
 where type = 'task_status' and status_group = 'complete' and name_i18n is null;
