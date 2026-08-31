-- Default tags: the full catalogue the app expects to exist.
--
-- WHY: only three status tags shipped before, which left a fresh install
-- unusable — no member roles, no ledger categories, no task statuses, no
-- priorities. A project could not even be given a status.
--
-- `status_group` means different things per tag type; the column is reused on
-- purpose. project_status -> pipeline tab, task_status -> kanban column,
-- ledger_category -> accounting direction (in/out, empty = both).
-- See src/domain/tags/groups.ts.
--
-- Guarded per slug rather than on the table being empty: migration 0015
-- already seeded three protected statuses, so an "is it empty" guard would
-- skip everything. Existing rows are never touched, so a manager who renamed
-- or recoloured a tag keeps their edit.
-- Adopt the three slug-less project statuses migration 0015 created, instead of
-- inserting near-duplicates beside them. They already carry translations from
-- 0016 and may already be assigned to projects; only the stable slug is
-- missing, and without it the guard below cannot see them.
UPDATE tags SET slug = 'project_status-3'
 WHERE slug = '' AND type = 'project_status' AND status_group = 'in_progress'
   AND NOT EXISTS (SELECT 1 FROM tags o WHERE o.slug = 'project_status-3');
UPDATE tags SET slug = 'project_status-5'
 WHERE slug = '' AND type = 'project_status' AND status_group = 'on_hold'
   AND NOT EXISTS (SELECT 1 FROM tags o WHERE o.slug = 'project_status-5');
UPDATE tags SET slug = 'project_status-6'
 WHERE slug = '' AND type = 'project_status' AND status_group = 'cancelled'
   AND NOT EXISTS (SELECT 1 FROM tags o WHERE o.slug = 'project_status-6');

INSERT INTO tags (slug, type, name, color, grants_cap, status_group,
                  is_review, is_closed, is_protected, sort_order, name_i18n)
SELECT v.slug, v.type, v.name, v.color, v.grants_cap, v.status_group,
       v.is_review, v.is_closed, v.is_protected, v.sort_order, v.name_i18n
FROM (VALUES
  ('project_status-notstarted', 'project_status', 'شروع نشده', '#d9d6f0', '', 'not_started', false, false, true, 1, '{"fa": "شروع نشده", "en": "Not started", "de": "Nicht begonnen", "ckb": "دەستپێنەکراو", "ar": "لم يبدأ", "tr": "Başlamadı", "fr": "Non commencé", "es": "No iniciado", "pt": "Não iniciado"}'::jsonb),
  ('project_status-1', 'project_status', 'مذاکره', '#9561a8', '', 'lead', false, false, true, 2, '{"fa": "مذاکره", "en": "Negotiating", "de": "Vertragsverhandlung", "ckb": "دانوستان", "ar": "تفاوض", "tr": "Müzakere", "fr": "Négociation", "es": "Negociación", "pt": "Negociação"}'::jsonb),
  ('project_status-2', 'project_status', 'در حال انجام', '#03cc00', '', 'in_progress', false, false, true, 3, '{"fa": "در حال انجام", "en": "In progress", "de": "In Arbeit", "ckb": "لە بەردەوامیدا", "ar": "قيد الإنجاز", "tr": "Devam ediyor", "fr": "En cours", "es": "En progreso", "pt": "Em progresso"}'::jsonb),
  ('project_status-3', 'project_status', 'در حال بررسی', '#eb8b05', '', 'in_progress', false, false, true, 4, '{"fa": "در حال بررسی", "en": "In review", "de": "In Prüfung", "ckb": "لە پێداچوونەوەدایە", "ar": "قيد المراجعة", "tr": "İnceleniyor", "fr": "En révision", "es": "En revisión", "pt": "Em revisão"}'::jsonb),
  ('project_status-4', 'project_status', 'تکمیل شده', '#2509fb', '', 'completed', false, true, true, 5, '{"fa": "تکمیل شده", "en": "Completed", "de": "Abgeschlossen", "ckb": "تەواو بوو", "ar": "مكتمل", "tr": "Tamamlandı", "fr": "Terminé", "es": "Completado", "pt": "Concluído"}'::jsonb),
  ('project_status-5', 'project_status', 'نگه‌داشته‌شده', '#c7c7c7', '', 'on_hold', false, false, true, 6, '{"fa": "نگه‌داشته‌شده", "en": "On hold", "de": "Pausiert", "ckb": "راگیراوە", "ar": "معلّق", "tr": "Beklemede", "fr": "En attente", "es": "En espera", "pt": "Em espera"}'::jsonb),
  ('project_status-6', 'project_status', 'کنسل شده', '#ff0000', '', 'cancelled', false, true, true, 7, '{"fa": "کنسل شده", "en": "Cancelled", "de": "Storniert", "ckb": "هەڵوەشاوە", "ar": "ملغى", "tr": "İptal edildi", "fr": "Annulé", "es": "Cancelado", "pt": "Cancelado"}'::jsonb),
  ('member-1', 'member_role', 'دیزاینر', '#c0b9f3', '', '', false, false, false, 8, '{"fa": "دیزاینر", "en": "Designer", "de": "Designer", "ckb": "دیزاینەر", "ar": "مصمم", "tr": "Tasarımcı", "fr": "Designer", "es": "Diseñador", "pt": "Designer"}'::jsonb),
  ('member-2', 'member_role', 'دولوپر', '#665abf', '', '', false, false, false, 9, '{"fa": "دولوپر", "en": "Developer", "de": "Entwickler", "ckb": "گەشەپێدەر", "ar": "مطوّر", "tr": "Geliştirici", "fr": "Développeur", "es": "Desarrollador", "pt": "Desenvolvedor"}'::jsonb),
  ('animator', 'member_role', 'انیماتور', '#60cbe6', '', '', false, false, false, 10, '{"fa": "انیماتور", "en": "Animator", "de": "Animator", "ckb": "ئەنیمەیتەر", "ar": "رسّام رسوم متحركة", "tr": "Animatör", "fr": "Animateur", "es": "Animador", "pt": "Animador"}'::jsonb),
  ('member-4', 'member_role', 'حسابدار', '#95f9d3', 'finance_scoped', '', false, false, false, 11, '{"fa": "حسابدار", "en": "Accountant", "de": "Buchhalter", "ckb": "ژمێریار", "ar": "محاسب", "tr": "Muhasebeci", "fr": "Comptable", "es": "Contador", "pt": "Contador"}'::jsonb),
  ('member-5', 'member_role', 'مدیر پروژه', '#a7bd98', 'pm', '', false, false, false, 12, '{"fa": "مدیر پروژه", "en": "Project manager", "de": "Projektleiter", "ckb": "بەڕێوەبەری پڕۆژە", "ar": "مدير مشروع", "tr": "Proje Yöneticisi", "fr": "Chef de projet", "es": "Jefe de proyecto", "pt": "Gestor de Projetos"}'::jsonb),
  ('team-manager', 'member_role', 'مدیر تیم', '#7a8c6e', 'office_manager', '', false, false, false, 13, '{"fa": "مدیر تیم", "en": "Team Manager", "de": "Teamleiter", "ckb": "بەڕێوەبەری تیم", "ar": "مدير فريق", "tr": "Takım Yöneticisi", "fr": "Manager d’équipe", "es": "Jefe de equipo", "pt": "Gerente de equipa"}'::jsonb),
  ('graphic-designer', 'member_role', 'طراح گرافیک', '#99f372', '', '', false, false, false, 14, '{"fa": "طراح گرافیک", "en": "Graphic Designer", "de": "Grafikdesigner", "ckb": "دیزاینەری گرافیک", "ar": "مصمم جرافيك", "tr": "Grafik Tasarımcı", "fr": "Graphiste", "es": "Diseñador gráfico", "pt": "Designer gráfico"}'::jsonb),
  ('accounting-manager', 'member_role', 'مدیر حسابداری', '#6c5ce7', 'manage_finance', '', false, false, false, 15, '{"fa": "مدیر حسابداری", "en": "Accounting Manager", "de": "Buchhaltungsleiter", "ckb": "بەڕێوەبەری حسابداری", "ar": "مدير المحاسبة", "tr": "Muhasebe Müdürü", "fr": "Responsable comptable", "es": "Gerente de contabilidad", "pt": "Gerente de contabilidade"}'::jsonb),
  ('ledger-1', 'ledger_category', 'واریز', '#00c728', '', 'in', false, false, false, 16, '{"fa": "واریز", "en": "Deposit", "de": "Einzahlung", "ckb": "پارەدان", "ar": "إيداع", "tr": "Mevduat", "fr": "Dépôt", "es": "Depósito", "pt": "Depósito"}'::jsonb),
  ('ledger-2', 'ledger_category', 'برداشت', '#f50000', '', 'out', false, false, false, 17, '{"fa": "برداشت", "en": "Withdrawal", "de": "Auszahlung", "ckb": "دەرهێنان", "ar": "سحب", "tr": "Çekim", "fr": "Retrait", "es": "Retiro", "pt": "Levantamento"}'::jsonb),
  ('ledger-3', 'ledger_category', 'حقوق', '#8a7cf3', '', 'out', false, false, false, 18, '{"fa": "حقوق", "en": "Salary", "de": "Gehalt", "ckb": "مووچە", "ar": "راتب", "tr": "Maaş", "fr": "Salaire", "es": "Salario", "pt": "Salário"}'::jsonb),
  ('ledger-4', 'ledger_category', 'وام', '#504794', '', '', false, false, false, 19, '{"fa": "وام", "en": "Loan", "de": "Darlehen", "ckb": "قەرز", "ar": "قرض", "tr": "Kredi", "fr": "Prêt", "es": "Préstamo", "pt": "Empréstimo"}'::jsonb),
  ('ledger-5', 'ledger_category', 'سود بانک', '#044319', '', 'in', false, false, false, 20, '{"fa": "سود بانک", "en": "Bank interest", "de": "Bankzinsen", "ckb": "سوودی بانک", "ar": "فائدة بنكية", "tr": "Banka faizi", "fr": "Intérêt bancaire", "es": "Interés bancario", "pt": "Juros bancários"}'::jsonb),
  ('ledger-6', 'ledger_category', 'هزینه', '#740202', '', 'out', false, false, false, 21, '{"fa": "هزینه", "en": "Expense", "de": "Ausgaben", "ckb": "خەرجی", "ar": "مصروفات", "tr": "Gider", "fr": "Dépense", "es": "Gasto", "pt": "Despesa"}'::jsonb),
  ('high', 'task_priority', 'بالا', '#e74c3c', '', '', false, false, false, 22, '{"fa": "بالا", "en": "High", "de": "Hoch", "ckb": "بەرز", "ar": "عالي", "tr": "Yüksek", "fr": "Haute", "es": "Alta", "pt": "Alta"}'::jsonb),
  ('medium', 'task_priority', 'متوسط', '#428bff', '', '', false, false, false, 23, '{"fa": "متوسط", "en": "Medium", "de": "Mittel", "ckb": "مامناوەند", "ar": "متوسطة", "tr": "Orta", "fr": "Moyen", "es": "Medio", "pt": "Médio"}'::jsonb),
  ('low', 'task_priority', 'پایین', '#30a17f', '', '', false, false, false, 24, '{"fa": "پایین", "en": "Low", "de": "Niedrig", "ckb": "نزم", "ar": "منخفض", "tr": "Düşük", "fr": "Bas", "es": "Bajo", "pt": "Baixo"}'::jsonb),
  ('not-started', 'task_status', 'شروع نشده', '#b9b7c2', '', 'todo', false, false, false, 25, '{"fa": "شروع نشده", "en": "Not Started", "de": "Nicht gestartet", "ckb": "دەستپێنەکراو", "ar": "لم يبدأ", "tr": "Başlamadı", "fr": "Non commencé", "es": "No iniciado", "pt": "Não iniciado"}'::jsonb),
  ('next-up', 'task_status', 'در نوبت', '#a298eb', '', 'todo', false, false, false, 26, '{"fa": "در نوبت", "en": "Next Up", "de": "Als nächstes", "ckb": "دواتر", "ar": "التالي", "tr": "Sıradaki", "fr": "Prochain", "es": "Siguiente", "pt": "Próximo"}'::jsonb),
  ('on-hold', 'task_status', 'در انتظار', '#b4cac9', '', 'in_progress', false, false, false, 27, '{"fa": "در انتظار", "en": "On Hold", "de": "In der Warteschleife", "ckb": "راگیراوە", "ar": "معلّق", "tr": "Beklemede", "fr": "En attente", "es": "En espera", "pt": "Em espera"}'::jsonb),
  ('in-progress', 'task_status', 'در حال انجام', '#00d65d', '', 'in_progress', false, false, false, 28, '{"fa": "در حال انجام", "en": "In Progress", "de": "Im Gange", "ckb": "لە بەردەوامیدا", "ar": "قيد الإنجاز", "tr": "Devam ediyor", "fr": "En cours", "es": "En progreso", "pt": "Em progresso"}'::jsonb),
  ('up-for-review', 'task_status', 'آماده برای بررسی', '#f36a20', '', 'in_progress', true, false, false, 29, '{"fa": "آماده برای بررسی", "en": "Up For Review", "de": "Zur Überprüfung", "ckb": "بۆ پێداچوونەوەیە", "ar": "قيد المراجعة", "tr": "İncelemeye sunuldu", "fr": "À réviser", "es": "Para revisión", "pt": "Em revisão"}'::jsonb),
  ('need-more-work', 'task_status', 'نیاز به کار بیشتر', '#ff0000', '', 'in_progress', false, false, false, 30, '{"fa": "نیاز به کار بیشتر", "en": "Need More Work", "de": "Mehr Arbeit erforderlich", "ckb": "پێویستی بە کار زیاتر", "ar": "يحتاج إلى مزيد", "tr": "Daha fazla çalışma", "fr": "Besoin de plus de travail", "es": "Necesita más trabajo", "pt": "Precisa de mais trabalho"}'::jsonb),
  ('done', 'task_status', 'انجام شد', '#1e00ff', '', 'complete', false, true, false, 31, '{"fa": "انجام شد", "en": "Done", "de": "Erledigt", "ckb": "تەواو", "ar": "تم", "tr": "Tamam", "fr": "Fait", "es": "Hecho", "pt": "Feito"}'::jsonb),
  ('archive', 'task_status', 'بایگانی', '#a79093', '', 'complete', false, true, false, 32, '{"fa": "بایگانی", "en": "Archive", "de": "Archiv", "ckb": "ئەرشیف", "ar": "أرشيف", "tr": "Arşiv", "fr": "Archive", "es": "Archivo", "pt": "Arquivo"}'::jsonb)
) AS v(slug, type, name, color, grants_cap, status_group,
       is_review, is_closed, is_protected, sort_order, name_i18n)
WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.slug = v.slug);
