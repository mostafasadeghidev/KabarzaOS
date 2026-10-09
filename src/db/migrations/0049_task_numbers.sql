-- شمارهٔ تسک بر اساسِ پروژه + کدِ کوتاهِ پروژه (۲.۱۶.۰).
--
-- ۱. هر پروژه شمارندهٔ خودش را دارد (`task_seq`)؛ تسکِ تازه شمارهٔ بعدی را
--    می‌گیرد و شماره هرگز دوباره داده نمی‌شود — حتی بعد از حذفِ تسک.
-- ۲. شماره را **خودِ پایگاه‌داده** هنگامِ درج می‌دهد (تریگر)، نه کدِ برنامه:
--    هر مسیرِ ساخت — فرم، QA، بازبینی، ربات، MCP، درون‌ریزی و بازگردانیِ
--    پشتیبان — بی‌استثنا شماره می‌گیرد و دو درجِ هم‌زمان شمارهٔ تکراری
--    نمی‌سازند (قفلِ ردیفِ پروژه).
-- ۳. تسک‌های فعلی به ترتیبِ ساخت شماره می‌گیرند (حذف‌شده‌ها هم، تا شماره‌ای
--    که پیش‌تر دیده شده به تسکِ دیگری نرسد).
-- ۴. کدِ پروژه (مثلاً ALZ) برای ارجاع بیرون از پروژه: ALZ-325. پیش‌فرض از
--    حروفِ لاتینِ عنوان، وگرنه P + شناسه؛ مدیر عوضش می‌کند.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS code text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN IF NOT EXISTS task_seq integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS number integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE tasks t SET number = r.n
FROM (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n
  FROM tasks
) r
WHERE r.id = t.id;
--> statement-breakpoint
UPDATE projects p SET task_seq = COALESCE((SELECT max(number) FROM tasks WHERE project_id = p.id), 0);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS tasks_project_number_ux ON tasks (project_id, number);
--> statement-breakpoint
-- کدِ پیش‌فرض: سه حرفِ اولِ لاتینِ عنوان؛ کوتاه/عددی ← P + شناسه؛ تکراری ← + شناسه.
UPDATE projects p SET code = c.code
FROM (
  SELECT id,
    CASE WHEN rank() OVER (PARTITION BY cand ORDER BY id) = 1 THEN cand ELSE left(cand, 3) || id END AS code
  FROM (
    SELECT id,
      CASE WHEN length(l) >= 2 AND l ~ '^[A-Z]' THEN left(l, 3) ELSE 'P' || id END AS cand
    FROM (SELECT id, upper(regexp_replace(title, '[^A-Za-z0-9]', '', 'g')) AS l FROM projects) s
  ) s2
) c
WHERE c.id = p.id AND p.code = '';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS projects_code_ux ON projects (upper(code)) WHERE code <> '';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tasks_assign_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number <= 0
     OR (TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id AND NEW.number = OLD.number) THEN
    UPDATE projects SET task_seq = task_seq + 1 WHERE id = NEW.project_id RETURNING task_seq INTO NEW.number;
  ELSE
    -- شمارهٔ صریح (بازگردانیِ پشتیبان/درون‌ریزی): شمارنده عقب نماند.
    UPDATE projects SET task_seq = GREATEST(task_seq, NEW.number) WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tasks_assign_number_tg ON tasks;
--> statement-breakpoint
CREATE TRIGGER tasks_assign_number_tg BEFORE INSERT OR UPDATE OF project_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_assign_number();
