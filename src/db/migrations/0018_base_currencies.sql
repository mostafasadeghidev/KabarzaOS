-- Base currencies for a fresh install.
--
-- ⚠️ Why this is a migration and not a seed script: `accounts.currency_id`
-- is NOT NULL with a foreign key to `currencies`. With an empty table the
-- currency dropdown has nothing in it, so no financial account can be
-- created at all — the whole finance module is dead on arrival. The seed
-- script is development-only and never runs in production.
--
-- ⚠️ Guarded on the table being empty, not on individual codes: once an
-- operator has set up their own currencies, a later migration must not
-- push rows back in or flip anyone's default.
INSERT INTO currencies (code, name, symbol, decimals, is_default, is_active)
SELECT * FROM (VALUES
  ('EUR', 'Euro',         '€',   2, true,  true),
  ('USD', 'US Dollar',    '$',   2, false, true),
  ('IRR', 'Iranian Rial', 'ریال', 0, false, true)
) AS v(code, name, symbol, decimals, is_default, is_active)
WHERE NOT EXISTS (SELECT 1 FROM currencies);
