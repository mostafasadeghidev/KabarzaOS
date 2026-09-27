-- One slug, one tag.
--
-- WHY: the slug is how migrations and code find a catalogue tag — 0019 and
-- 0030 guard their inserts on it, and `next-up` drives task dependencies
-- (src/domain/projects/dependency.ts). Nothing stopped two rows from sharing
-- one: 0024 backfilled empty slugs as `type-id`, and for a project status
-- whose id is 1..6 that is exactly the catalogue's own `project_status-N`.
-- A lookup by slug then picked one of the two rows.
--
-- Existing duplicates are renamed, never merged or deleted: either row may
-- already hang on projects, tasks or ledger rows, and deciding which one
-- survives is a data decision, not a schema one. The row that keeps the slug
-- is the one whose slug is not merely its own backfilled `type-id` (that is,
-- the catalogue row); on a tie, the oldest row keeps it. The others become
-- `slug-id`, which is unique because the id is.
--
-- Empty slugs stay allowed (partial index): the settings screen inserts a
-- tag first and gives it `type-id` right after, so '' is a legitimate
-- transient value.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY slug
           ORDER BY (slug = type || '-' || id) ASC, id ASC
         ) AS rn
    FROM tags
   WHERE slug <> ''
)
UPDATE tags t
   SET slug = t.slug || '-' || t.id
  FROM ranked r
 WHERE r.id = t.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS tags_slug_uq ON tags (slug) WHERE slug <> '';
